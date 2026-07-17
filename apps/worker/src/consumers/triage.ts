/**
 * `triage` consumer — Haiku 4.5, strict-JSON `TriageResult`.
 *
 * Loads the (decrypted) message, runs `buildTriagePrompt` → the cheap high-volume
 * triage model with prompt caching on the frozen taxonomy prefix and thinking
 * OFF, validates the strict-JSON result, then writes category / priorityScore /
 * priority / language + the ciphertext TL;DR onto the thread and bumps the AI
 * usage counter. A validation failure throws so the runner retries with backoff.
 */

import { z } from 'zod'
import { buildTriagePrompt, type TriageResult } from '@revido/core'
import type { AccountContext } from '../db/accounts'
import type { MailStore } from '../mail/store'
import type { WorkerLlmClient } from '../llm'
import type { JobConsumer } from '../queue/runner'
import { triagePayload } from '../queue/jobs'

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
const TRIAGE_MAX_TOKENS = 512

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

    const prompt = buildTriagePrompt({
      from: input.from,
      to: input.to,
      subject: input.subject,
      date: input.date,
      body: input.body,
    })

    const result = await deps.llm.complete({
      model: 'triage',
      system: prompt.system,
      messages: prompt.messages,
      maxTokens: TRIAGE_MAX_TOKENS,
      responseFormat: { type: 'json' },
      // thinking omitted ⇒ disabled (triage is high-volume and must stay cheap).
      userId: account.userId,
    })

    const triage = parseTriageResult(result.json)
    await deps.mail.applyTriage({
      userId: account.userId,
      threadId,
      messageId,
      crypto: account.crypto,
      result: triage,
    })
    await deps.mail.increment(account.userId, 'ai_enrichments')
  }
}
