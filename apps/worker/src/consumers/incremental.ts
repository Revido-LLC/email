/**
 * `incremental` consumer — apply a push-notified delta (Gmail history.list /
 * Graph delta) via the core adapter.
 *
 * Idempotently upserts the changed messages, deletes removed ones, advances the
 * provider cursor (historyId for Gmail, deltaLink for Outlook), and enqueues
 * `triage` for each new inbound message. A missing cursor means no watch has
 * seeded one yet — the job is a no-op until `renew_watch` runs.
 */

import type { AccountContext } from '../db/accounts'
import type { AdapterFactory } from '../adapters'
import type { ProviderCredentials } from '@revido/core'
import type { SyncStore } from '../mail/store'
import type { JobStore } from '../queue/store'
import type { JobConsumer } from '../queue/runner'
import { QUEUE, incrementalPayload, type TriagePayload } from '../queue/jobs'

export interface IncrementalDeps {
  loadAccount(accountId: string): Promise<AccountContext>
  adapterFor: AdapterFactory
  mail: Pick<SyncStore, 'persistMessage' | 'deleteMessages' | 'getSyncState' | 'saveCursor'>
  jobs: Pick<JobStore, 'enqueue'>
  saveCredentials(account: AccountContext, creds: ProviderCredentials): Promise<void>
}

export function makeIncrementalConsumer(deps: IncrementalDeps): JobConsumer {
  return async (payload) => {
    const { accountId, cursor } = incrementalPayload.parse(payload)
    const account = await deps.loadAccount(accountId)
    const adapter = deps.adapterFor(account.provider)

    const creds = await adapter.connect(account.creds)
    if (creds !== account.creds) await deps.saveCredentials(account, creds)

    const state = await deps.mail.getSyncState(accountId)
    const startCursor = cursor ?? state?.historyId ?? state?.deltaLink ?? undefined
    if (!startCursor) return // no watch cursor yet

    const delta = await adapter.incremental(creds, startCursor)

    for (const msg of delta.upserted) {
      const persisted = await deps.mail.persistMessage(
        { accountId, userId: account.userId, crypto: account.crypto },
        msg,
      )
      if (persisted.isNew && !msg.outbound) {
        const triageJob: TriagePayload = {
          accountId,
          threadId: persisted.threadId,
          messageId: persisted.messageId,
        }
        await deps.jobs.enqueue(QUEUE.triage, triageJob)
      }
    }

    if (delta.deletedProviderMessageIds.length > 0) {
      await deps.mail.deleteMessages(account.userId, delta.deletedProviderMessageIds)
    }

    await deps.mail.saveCursor({
      accountId,
      userId: account.userId,
      historyId: account.provider === 'gmail' ? delta.nextCursor : undefined,
      deltaLink: account.provider === 'outlook' ? delta.nextCursor : undefined,
    })
  }
}
