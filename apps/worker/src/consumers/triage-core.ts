/**
 * Shared triage primitives used by BOTH triage paths, so the two stay identical:
 *  - the real-time per-message `triage` consumer (live/incremental mail), and
 *  - the batch path — `backfill` submits a page's prompts as ONE Anthropic Batches
 *    request (−50% cost) and the `triage_batch` poller collects + persists them.
 *
 * Centralizing the request shape (cheap Haiku tier, strict JSON, thinking OFF),
 * the strict-JSON validation, and the persistence (`applyTriage` + usage meter)
 * means a batched result is produced and stored exactly like a real-time one.
 */

import { z } from 'zod'
import {
  buildTriagePrompt,
  type LlmCompletionRequest,
  type RawFetchedMessage,
  type TriageResult,
} from '@revido/core'
import type { AccountCrypto } from '../db/accounts'
import type { MailStore, TriageInput } from '../mail/store'
import { htmlToText } from '../sync/html'

const CATEGORY_IDS = [
  'to-reply',
  'awaiting-reply',
  'fyi',
  'newsletters',
  'notifications',
  'promotions',
  'receipts',
  'calendar',
  'personal',
] as const

const triageResultSchema: z.ZodType<TriageResult> = z.object({
  category: z.enum(CATEGORY_IDS),
  priorityScore: z.number().int().min(0).max(100),
  priority: z.enum(['urgent', 'high', 'normal', 'low']),
  tldr: z.string().min(1),
  language: z.string().min(1),
})

/** Validate an LLM JSON payload into a `TriageResult` (throws on mismatch). */
export function parseTriageResult(json: unknown): TriageResult {
  return triageResultSchema.parse(json)
}

/** The maximum output for a triage call — the JSON object is tiny. */
export const TRIAGE_MAX_TOKENS = 512

/**
 * The cheap, high-volume triage completion request for one message: Haiku tier,
 * prompt-cached taxonomy prefix, strict JSON, thinking omitted (⇒ disabled). Used
 * by the real-time consumer's `complete` and by each `submitBatch` request item.
 */
export function buildTriageRequest(input: TriageInput, userId: string): LlmCompletionRequest {
  const prompt = buildTriagePrompt({
    from: input.from,
    to: input.to,
    subject: input.subject,
    date: input.date,
    body: input.body,
  })
  return {
    model: 'triage',
    system: prompt.system,
    messages: prompt.messages,
    maxTokens: TRIAGE_MAX_TOKENS,
    responseFormat: { type: 'json' },
    // thinking omitted ⇒ disabled (triage is high-volume and must stay cheap).
    userId,
  }
}

/**
 * Triage input straight from a just-ingested message — no DB round-trip. Mirrors
 * `PgMailStore.getTriageInput`'s body rule (prefer the text part; fall back to
 * stripping HTML) so batch triage runs over the same text the real-time path would.
 */
export function triageInputFromRawMessage(msg: RawFetchedMessage): TriageInput {
  const body = msg.text ? msg.text : msg.html ? htmlToText(msg.html) : ''
  return { subject: msg.subject, from: msg.from, to: msg.to, body, date: msg.date }
}

export interface PersistTriageInput {
  userId: string
  threadId: string
  messageId: string
  crypto: AccountCrypto
  result: TriageResult
}

/** Persist a triage result the one canonical way and bump the AI usage counter. */
export async function persistTriageResult(
  mail: Pick<MailStore, 'applyTriage' | 'increment'>,
  input: PersistTriageInput,
): Promise<void> {
  await mail.applyTriage({
    userId: input.userId,
    threadId: input.threadId,
    messageId: input.messageId,
    crypto: input.crypto,
    result: input.result,
  })
  await mail.increment(input.userId, 'ai_enrichments')
}
