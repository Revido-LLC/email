/**
 * `backfill` consumer — newest-first progressive import via the core adapter.
 *
 * One job imports one adapter page: refresh creds → `adapter.backfill(cursor)` →
 * idempotent upsert of each message (contacts/threads/messages/attachments,
 * content encrypted at rest) → advance `sync_state` → enqueue a `triage` job per
 * NEW inbound message. If the page has a next cursor the consumer re-enqueues
 * itself; when the backfill completes it enqueues `renew_watch` to register push
 * notifications and seed the incremental cursor. Re-running a page is a no-op
 * because upserts key on the provider ids.
 */

import type { ProviderCredentials, RawFetchedMessage } from '@revido/core'
import type { AccountContext } from '../db/accounts'
import type { AdapterFactory } from '../adapters'
import type { SyncStore } from '../mail/store'
import type { JobStore } from '../queue/store'
import type { JobConsumer } from '../queue/runner'
import {
  QUEUE,
  backfillPayload,
  type BackfillPayload,
  type RenewWatchPayload,
  type TriagePayload,
} from '../queue/jobs'

export interface BackfillDeps {
  loadAccount(accountId: string): Promise<AccountContext>
  adapterFor: AdapterFactory
  mail: Pick<SyncStore, 'persistMessage' | 'getSyncState' | 'saveBackfillProgress' | 'setSyncProgress'>
  jobs: Pick<JobStore, 'enqueue'>
  /** Persist refreshed OAuth tokens after `adapter.connect(...)`. */
  saveCredentials(account: AccountContext, creds: ProviderCredentials): Promise<void>
}

export function makeBackfillConsumer(deps: BackfillDeps): JobConsumer {
  return async (payload) => {
    const { accountId } = backfillPayload.parse(payload)
    const account = await deps.loadAccount(accountId)
    const adapter = deps.adapterFor(account.provider)

    const creds = await adapter.connect(account.creds)
    if (creds !== account.creds) await deps.saveCredentials(account, creds)

    const state = await deps.mail.getSyncState(accountId)
    if (state?.backfillComplete) return

    const cursor = state?.backfillCursor ?? undefined
    const page = await adapter.backfill(creds, cursor)

    for (const msg of page.messages) {
      const persisted = await deps.mail.persistMessage(
        { accountId, userId: account.userId, crypto: account.crypto },
        msg,
      )
      if (persisted.isNew && !isOutbound(msg)) {
        const triageJob: TriagePayload = {
          accountId,
          threadId: persisted.threadId,
          messageId: persisted.messageId,
        }
        await deps.jobs.enqueue(QUEUE.triage, triageJob)
      }
    }

    const complete = page.nextCursor === null
    await deps.mail.saveBackfillProgress({
      accountId,
      userId: account.userId,
      backfillCursor: page.nextCursor,
      backfillComplete: complete,
    })
    await deps.mail.setSyncProgress(accountId, complete ? 1 : 0.5, complete ? 'Synced' : 'Importing…')

    if (!complete) {
      const next: BackfillPayload = { accountId }
      await deps.jobs.enqueue(QUEUE.backfill, next)
    } else {
      const watch: RenewWatchPayload = { accountId }
      await deps.jobs.enqueue(QUEUE.renewWatch, watch)
    }
  }
}

function isOutbound(msg: RawFetchedMessage): boolean {
  return msg.outbound
}
