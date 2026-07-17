/**
 * `triage` consumer — the REAL-TIME per-message path for live/incremental mail.
 *
 * Loads the (decrypted) message, runs the cheap high-volume triage model (Haiku,
 * prompt-cached taxonomy prefix, thinking OFF, strict-JSON `TriageResult`), then
 * persists category / priorityScore / priority / language + the ciphertext TL;DR
 * and bumps the AI usage counter. A validation failure throws so the runner retries
 * with backoff. Historical BULK triage does NOT come through here — `backfill`
 * routes its pages through the async Batches API (see `triage-batch.ts`); this path
 * is reserved for mail the user is waiting on right now.
 *
 * The request shaping, validation, and persistence are shared with the batch path
 * via `./triage-core`, so a batched result is produced and stored identically.
 */

import type { AccountContext } from '../db/accounts'
import type { MailStore } from '../mail/store'
import type { WorkerLlmClient } from '../llm'
import type { JobConsumer } from '../queue/runner'
import { triagePayload } from '../queue/jobs'
import { buildTriageRequest, parseTriageResult, persistTriageResult } from './triage-core'

// Re-exported for callers/tests that reach for the validator by its historical home.
export { parseTriageResult } from './triage-core'

export interface TriageDeps {
  loadAccount(accountId: string): Promise<AccountContext>
  mail: Pick<MailStore, 'getTriageInput' | 'applyTriage' | 'increment'>
  llm: Pick<WorkerLlmClient, 'complete'>
}

export function makeTriageConsumer(deps: TriageDeps): JobConsumer {
  return async (payload) => {
    const { accountId, threadId, messageId } = triagePayload.parse(payload)
    const account = await deps.loadAccount(accountId)

    const input = await deps.mail.getTriageInput(account.userId, messageId, account.crypto)
    if (!input) return // message was deleted between enqueue and run — nothing to triage.

    const result = await deps.llm.complete(buildTriageRequest(input, account.userId))

    const triage = parseTriageResult(result.json)
    await persistTriageResult(deps.mail, {
      userId: account.userId,
      threadId,
      messageId,
      crypto: account.crypto,
      result: triage,
    })
  }
}
