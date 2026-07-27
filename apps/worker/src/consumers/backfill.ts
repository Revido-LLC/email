/**
 * `backfill` consumer — newest-first progressive import via the core adapter.
 *
 * One job imports at most the 100 newest messages from one provider page:
 * refresh creds → `adapter.backfill()` → idempotent upsert
 * (contacts/threads/messages/attachments,
 * content encrypted at rest) → embed every NEW message → advance `sync_state`.
 *
 * Triage of the page's NEW inbound mail is BULK, historical work, so — unlike the
 * real-time incremental path — it goes through the async Anthropic Batches API
 * (−50% cost): the whole page's triage prompts are submitted as ONE batch keyed by
 * `custom_id = messageId`, and a `triage_batch` poll job carries the batch id + the
 * id map so the poller can persist the (unordered) results and fan out `summary`
 * per thread once triage lands. `summary` is deferred to the poller so it sees the
 * batch-set priority/language; `embed` is triage-independent and stays eager.
 * Setting `batchTriage: false` (env `ANTHROPIC_BATCHES_DISABLED`) falls back to the
 * per-message real-time `triage` + `summary` fan-out, making the path reversible.
 *
 * The consumer deliberately ignores any next cursor, marks the initial import
 * complete, and enqueues `renew_watch` to register push notifications and seed the
 * incremental cursor. Re-running the page is a no-op because upserts key on provider ids.
 */

import type { ProviderCredentials, RawFetchedMessage } from '@revido/core'
import type { AccountContext } from '../db/accounts'
import type { AdapterFactory } from '../adapters'
import type { SyncStore } from '../mail/store'
import type { WorkerLlmClient } from '../llm'
import type { JobStore } from '../queue/store'
import type { JobConsumer } from '../queue/runner'
import {
  QUEUE,
  backfillPayload,
  type EmbedPayload,
  type RenewWatchPayload,
  type SummaryPayload,
  type TriageBatchItem,
  type TriageBatchPayload,
  type TriagePayload,
} from '../queue/jobs'
import { buildTriageRequest, triageInputFromRawMessage } from './triage-core'

export const INITIAL_IMPORT_LIMIT = 100

export interface BackfillDeps {
  loadAccount(accountId: string): Promise<AccountContext>
  adapterFor: AdapterFactory
  mail: Pick<
    SyncStore,
    'persistMessage' | 'getSyncState' | 'saveBackfillProgress' | 'setSyncProgress'
  >
  jobs: Pick<JobStore, 'enqueue'>
  /** The Batches surface used for bulk historical triage. */
  llm: Pick<WorkerLlmClient, 'submitBatch'>
  /**
   * Route this page's triage through the Batches API (−50% cost). When false —
   * `ANTHROPIC_BATCHES_DISABLED` — fall back to per-message real-time `triage`.
   */
  batchTriage: boolean
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

    const page = await adapter.backfill(creds)
    const newest = [...page.messages]
      .sort((left, right) => Date.parse(right.date) - Date.parse(left.date))
      .filter(
        (message, index, messages) =>
          messages.findIndex(
            (candidate) => candidate.providerMessageId === message.providerMessageId,
          ) === index,
      )
      .slice(0, INITIAL_IMPORT_LIMIT)

    // New inbound messages whose triage this page will submit as one batch.
    const batch: { customId: string; request: ReturnType<typeof buildTriageRequest> }[] = []
    const batchItems: TriageBatchItem[] = []
    // Real-time fallback only: at most one summary per thread that gained a message.
    const summarizedThreads = new Set<string>()

    for (const msg of newest) {
      const persisted = await deps.mail.persistMessage(
        { accountId, userId: account.userId, crypto: account.crypto },
        msg,
      )
      if (!persisted.isNew) continue

      // Embed every new message (inbound + outbound) for chat RAG. This is
      // triage-independent, so it stays eager — a triage failure never costs a
      // message its embedding, and the batch's latency never delays RAG.
      const embedJob: EmbedPayload = { accountId, messageId: persisted.messageId }
      await deps.jobs.enqueue(QUEUE.embed, embedJob)

      if (isOutbound(msg)) continue

      if (deps.batchTriage) {
        // Bulk historical triage → the Batches API, keyed by messageId. Summary is
        // deferred to the poller so it runs after the batch sets priority/language.
        batch.push({
          customId: persisted.messageId,
          request: buildTriageRequest(triageInputFromRawMessage(msg), account.userId),
        })
        batchItems.push({ messageId: persisted.messageId, threadId: persisted.threadId })
      } else {
        // Reversible fallback: real-time per-message triage + summary fan-out.
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

    // Submit the page's triage as ONE batch and hand the poller the id map. Like
    // the real-time enqueue, this rides the same job attempt as the persists above:
    // a submit failure retries the page (already-persisted messages are skipped).
    if (batch.length > 0) {
      const { batchId } = await deps.llm.submitBatch(batch)
      const pollJob: TriageBatchPayload = { accountId, batchId, items: batchItems }
      await deps.jobs.enqueue(QUEUE.triageBatch, pollJob)
    }

    await deps.mail.saveBackfillProgress({
      accountId,
      userId: account.userId,
      backfillCursor: null,
      backfillComplete: true,
    })
    await deps.mail.setSyncProgress(accountId, 1, 'Synced')

    // Never follow the provider's older-page cursor. Incremental sync handles
    // genuinely new arrivals after the watch is registered.
    const watch: RenewWatchPayload = { accountId }
    await deps.jobs.enqueue(QUEUE.renewWatch, watch)
  }
}

function isOutbound(msg: RawFetchedMessage): boolean {
  return msg.outbound
}
