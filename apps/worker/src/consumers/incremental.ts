/**
 * `incremental` consumer — apply a push-notified delta (Gmail history.list /
 * Graph delta) via the core adapter.
 *
 * The job arrives in one of two families (see `incrementalPayload`): the internal
 * `{ accountId }` reconcile sweep, or a raw provider-push envelope from the
 * api-service webhooks (Gmail `{ emailAddress, historyId }`, Outlook
 * `{ subscriptionId, resource, ... }`). Provider pushes carry NO account id — the
 * webhook has no session — so we resolve one service-side first (Gmail by mailbox
 * address, Outlook by the persisted watch subscription id). An unresolvable push
 * (e.g. a stale subscription) is a no-op SUCCESS, never a throw, so it can't
 * dead-letter forever.
 *
 * Once resolved it idempotently upserts the changed messages, deletes removed
 * ones, advances the provider cursor (historyId for Gmail, deltaLink for Outlook),
 * and enqueues `embed` + `triage` for each new message plus one `summary` per
 * changed thread. A missing cursor means no watch has seeded one yet — the job is
 * a no-op until `renew_watch` runs.
 */

import type { AccountContext } from '../db/accounts'
import type { AdapterFactory } from '../adapters'
import type { ProviderCredentials } from '@revido/core'
import type { SyncStore } from '../mail/store'
import type { JobStore } from '../queue/store'
import type { JobConsumer, Logger } from '../queue/runner'
import {
  QUEUE,
  incrementalPayload,
  type EmbedPayload,
  type IncrementalPayload,
  type SummaryPayload,
  type TriagePayload,
} from '../queue/jobs'

export interface IncrementalDeps {
  loadAccount(accountId: string): Promise<AccountContext>
  adapterFor: AdapterFactory
  mail: Pick<
    SyncStore,
    | 'persistMessage'
    | 'deleteMessages'
    | 'getSyncState'
    | 'saveCursor'
    | 'resolveAccountByEmail'
    | 'resolveAccountBySubscription'
  >
  jobs: Pick<JobStore, 'enqueue'>
  saveCredentials(account: AccountContext, creds: ProviderCredentials): Promise<void>
  logger?: Pick<Logger, 'info'>
}

/** The account id + optional cursor override a resolved incremental job runs against. */
interface ResolvedTarget {
  accountId: string
  cursor?: string
}

/**
 * Map any of the three `incremental` payload shapes onto an account id. The
 * `{ accountId }` shape is used verbatim; provider pushes are resolved against the
 * db (Gmail by address, Outlook by subscription id). Returns null when no account
 * matches — the caller treats that as a no-op success.
 */
async function resolveTarget(
  deps: IncrementalDeps,
  payload: IncrementalPayload,
): Promise<ResolvedTarget | null> {
  if ('accountId' in payload) {
    return { accountId: payload.accountId, cursor: payload.cursor }
  }
  if (payload.provider === 'gmail') {
    const account = await deps.mail.resolveAccountByEmail('gmail', payload.emailAddress)
    return account ? { accountId: account.accountId } : null
  }
  const account = await deps.mail.resolveAccountBySubscription(payload.subscriptionId)
  return account ? { accountId: account.accountId } : null
}

export function makeIncrementalConsumer(deps: IncrementalDeps): JobConsumer {
  return async (payload) => {
    const parsed = incrementalPayload.parse(payload)
    const target = await resolveTarget(deps, parsed)
    if (!target) {
      // A push for a mailbox we no longer watch (unlinked account, stale Graph
      // subscription). Succeed quietly so it never dead-letters.
      deps.logger?.info('incremental: no account resolved for provider push; skipping', {
        payload: 'provider' in parsed ? parsed.provider : 'accountId',
      })
      return
    }
    const { accountId, cursor } = target
    const account = await deps.loadAccount(accountId)
    const adapter = deps.adapterFor(account.provider)

    const creds = await adapter.connect(account.creds)
    if (creds !== account.creds) await deps.saveCredentials(account, creds)

    const state = await deps.mail.getSyncState(accountId)
    const startCursor = cursor ?? state?.historyId ?? state?.deltaLink ?? undefined
    if (!startCursor) return // no watch cursor yet

    const delta = await adapter.incremental(creds, startCursor)

    // Enqueue at most one summary per thread that gained a new message this delta.
    const summarizedThreads = new Set<string>()
    for (const msg of delta.upserted) {
      const persisted = await deps.mail.persistMessage(
        { accountId, userId: account.userId, crypto: account.crypto },
        msg,
      )
      if (persisted.isNew) {
        const embedJob: EmbedPayload = { accountId, messageId: persisted.messageId }
        await deps.jobs.enqueue(QUEUE.embed, embedJob)
        if (!msg.outbound) {
          const triageJob: TriagePayload = {
            accountId,
            threadId: persisted.threadId,
            messageId: persisted.messageId,
          }
          await deps.jobs.enqueue(QUEUE.triage, triageJob)
          if (!summarizedThreads.has(persisted.threadId)) {
            summarizedThreads.add(persisted.threadId)
            const summaryJob: SummaryPayload = { accountId, threadId: persisted.threadId }
            await deps.jobs.enqueue(QUEUE.summary, summaryJob)
          }
        }
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
