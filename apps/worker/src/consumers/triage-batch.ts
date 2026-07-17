/**
 * `triage_batch` consumer — poll a submitted Batches triage job, then persist.
 *
 * `backfill` submits a whole page's triage prompts as ONE Anthropic Batches request
 * (−50% vs real-time) and enqueues this job with the returned `batchId` + the
 * `{ messageId, threadId }` map it needs to re-key the UNORDERED results.
 *
 * Batches are async (minutes to hours), so this consumer must NOT block on
 * `collectBatch` — that would hold the job lock past its TTL and get the job
 * reclaimed mid-wait. Instead it polls once: while the batch is `in_progress` /
 * `canceling` it re-enqueues itself on a delay and touches nothing; once `ended` it
 * collects every result keyed by `custom_id` (= messageId), persists each success
 * the SAME way the real-time triage consumer does, meters usage, and fans a
 * `summary` out per thread that got a fresh triage. A missing / errored / invalid
 * `custom_id` is logged and skipped so one bad message never fails the whole batch.
 */

import type { AccountContext } from '../db/accounts'
import type { MailStore } from '../mail/store'
import type { WorkerLlmClient } from '../llm'
import type { JobStore } from '../queue/store'
import type { JobConsumer, Logger } from '../queue/runner'
import {
  QUEUE,
  triageBatchPayload,
  type SummaryPayload,
  type TriageBatchPayload,
} from '../queue/jobs'
import { parseTriageResult, persistTriageResult } from './triage-core'

/** How long to wait before re-polling a batch that is still processing. */
const BATCH_POLL_DELAY_MS = 60_000

export interface TriageBatchDeps {
  loadAccount(accountId: string): Promise<AccountContext>
  mail: Pick<MailStore, 'applyTriage' | 'increment'>
  llm: Pick<WorkerLlmClient, 'pollBatch' | 'collectBatch'>
  jobs: Pick<JobStore, 'enqueue'>
  logger: Logger
  now?(): Date
  /** Delay before re-polling an unfinished batch (overridable for tests). */
  pollDelayMs?: number
}

export function makeTriageBatchConsumer(deps: TriageBatchDeps): JobConsumer {
  const pollDelayMs = deps.pollDelayMs ?? BATCH_POLL_DELAY_MS
  return async (payload) => {
    const { accountId, batchId, items } = triageBatchPayload.parse(payload)

    const { status } = await deps.llm.pollBatch(batchId)
    if (status !== 'ended') {
      // Still processing — re-poll later without persisting anything. This is a
      // fresh job (attempts reset), so polling never burns the retry budget.
      const now = (deps.now ?? ((): Date => new Date()))()
      const reschedule: TriageBatchPayload = { accountId, batchId, items }
      await deps.jobs.enqueue(QUEUE.triageBatch, reschedule, {
        runAt: new Date(now.getTime() + pollDelayMs),
      })
      return
    }

    const account = await deps.loadAccount(accountId)
    const results = await deps.llm.collectBatch(batchId)

    // Results are UNORDERED — key by custom_id(messageId), not position.
    const summarize = new Set<string>()
    for (const item of items) {
      const res = results.get(item.messageId)
      if (!res || res.status !== 'succeeded' || !res.result) {
        deps.logger.error('triage batch item unresolved; skipping', {
          batchId,
          messageId: item.messageId,
          status: res?.status ?? 'missing',
          error: res?.error,
        })
        continue
      }

      let triage
      try {
        triage = parseTriageResult(res.result.json)
      } catch (err) {
        deps.logger.error('triage batch item failed validation; skipping', {
          batchId,
          messageId: item.messageId,
          error: err instanceof Error ? err.message : String(err),
        })
        continue
      }

      await persistTriageResult(deps.mail, {
        userId: account.userId,
        threadId: item.threadId,
        messageId: item.messageId,
        crypto: account.crypto,
        result: triage,
      })
      summarize.add(item.threadId)
    }

    // Fan out one summary per freshly-triaged thread (embed already ran at ingest).
    // Deferring to here means the summary sees the batch-set priority/language.
    for (const threadId of summarize) {
      const summaryJob: SummaryPayload = { accountId, threadId }
      await deps.jobs.enqueue(QUEUE.summary, summaryJob)
    }
  }
}
