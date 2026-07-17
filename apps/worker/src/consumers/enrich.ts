/**
 * `summary` consumer — thread summary via Sonnet 5, escalating hard cases to
 * Opus 4.8.
 *
 * Loads the decrypted thread, builds the summary prompt with the user's
 * output-language preference, runs the reasoning model with EXPLICIT thinking
 * (disabled for routine threads, adaptive for escalated ones), and writes the
 * ciphertext summary onto the thread. Structured fact extraction is scaffolded
 * (the store writes an `extracted_facts` set) but the fact-mining prompt is
 * deferred — this consumer currently writes the summary and an empty fact set.
 */

import { z } from 'zod'
import type { Message, Thread } from '@revido/db'
import { buildSummaryPrompt } from '@revido/core'
import type { AccountContext } from '../db/accounts'
import type { EnrichStore, FollowUpStore, ThreadForSummary, UsageStore } from '../mail/store'
import type { WorkerLlmClient } from '../llm'
import type { JobConsumer } from '../queue/runner'
import type { LlmThinking } from '@revido/core'
import { summaryPayload } from '../queue/jobs'
import { buildFollowUpDetectionPrompt } from './prompts'

/** Threads at/above this size — or flagged urgent — escalate to Opus. */
const ESCALATE_MESSAGE_COUNT = 8
const SUMMARY_MAX_TOKENS = 1024
const DETECTION_MAX_TOKENS = 768
/** Default horizons when the model doesn't pin a date. */
const REMINDER_DUE_DAYS = 3
const COMMITMENT_DUE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

export interface SummaryDeps {
  loadAccount(accountId: string): Promise<AccountContext>
  mail: Pick<EnrichStore, 'getThread' | 'applySummary'> &
    Pick<FollowUpStore, 'createReminder' | 'createCommitment'> &
    Pick<UsageStore, 'increment'>
  llm: Pick<WorkerLlmClient, 'complete'>
  now?(): Date
}

/** Best-effort detection result. Lenient — a malformed reply yields no rows. */
const followUpSchema = z.object({
  awaitingReply: z.boolean().default(false),
  chaserDraft: z.string().nullish(),
  commitments: z
    .array(z.object({ text: z.string().min(1), dueAt: z.string().nullish() }))
    .default([]),
})
export type FollowUpDetection = z.infer<typeof followUpSchema>

/** Parse the detection JSON, returning null when it doesn't match (never throws). */
export function parseFollowUpDetection(json: unknown): FollowUpDetection | null {
  const parsed = followUpSchema.safeParse(json)
  return parsed.success ? parsed.data : null
}

function contactDisplay(c: { name: string; email: string }): string {
  return c.name ? `${c.name} <${c.email}>` : c.email
}

/** A compact transcript for the follow-up detector. */
function renderTranscript(thread: ThreadForSummary): string {
  return thread.messages
    .map((m) => {
      const who = m.outbound ? 'You' : contactDisplay(m.from)
      return `${who} (${m.date}):\n${m.body.slice(0, 2_000)}`
    })
    .join('\n\n')
}

function dueDate(now: Date, iso: string | null | undefined, fallbackDays: number): Date {
  if (iso) {
    const parsed = new Date(iso)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return new Date(now.getTime() + fallbackDays * DAY_MS)
}

/** Adapt the decrypted store shape into the domain `Thread`/`Message[]` the builder wants. */
function toDomainThread(threadId: string, accountId: string, thread: ThreadForSummary): Thread {
  return {
    id: threadId,
    accountId,
    subject: thread.subject,
    participants: [],
    category: 'fyi',
    priority: thread.priority,
    priorityScore: 0,
    tldr: '',
    summary: '',
    unread: false,
    starred: false,
    snoozedUntil: null,
    hasAttachments: false,
    badges: [],
    extracted: [],
    messageIds: [],
    lastMessageAt: thread.messages.at(-1)?.date ?? new Date(0).toISOString(),
    awaitingReply: false,
    labels: [],
  }
}

function toDomainMessages(threadId: string, thread: ThreadForSummary): Message[] {
  return thread.messages.map((m, i) => ({
    id: `${threadId}:${i}`,
    threadId,
    from: m.from,
    to: [],
    date: m.date,
    html: '',
    text: m.body,
    unread: false,
    outbound: m.outbound,
    attachments: [],
  }))
}

export function makeSummaryConsumer(deps: SummaryDeps): JobConsumer {
  return async (payload) => {
    const { accountId, threadId } = summaryPayload.parse(payload)
    const account = await deps.loadAccount(accountId)

    const thread = await deps.mail.getThread(account.userId, threadId, account.crypto)
    if (!thread || thread.messages.length === 0) return

    const prompt = buildSummaryPrompt(
      toDomainThread(threadId, accountId, thread),
      toDomainMessages(threadId, thread),
      {
        outputLanguage: thread.outputLanguage,
        detectedLanguage: thread.detectedLanguage ?? undefined,
      },
    )

    const escalate = thread.messages.length >= ESCALATE_MESSAGE_COUNT || thread.priority === 'urgent'
    const thinking: LlmThinking = escalate ? { type: 'adaptive' } : { type: 'disabled' }

    const result = await deps.llm.complete({
      model: escalate ? 'escalation' : 'summary',
      system: prompt.system,
      messages: prompt.messages,
      maxTokens: SUMMARY_MAX_TOKENS,
      thinking,
      userId: account.userId,
    })

    await deps.mail.applySummary({
      userId: account.userId,
      threadId,
      crypto: account.crypto,
      summary: result.text.trim(),
      facts: [], // structured extraction deferred — see file header.
    })

    // Follow-through detection is best-effort: it must never fail the summary
    // that already succeeded. Only threads the user participated in can carry
    // their commitments / an awaiting-reply chase.
    if (thread.messages.some((m) => m.outbound)) {
      try {
        await detectFollowUps(deps, account, threadId, thread, result.text.trim())
      } catch {
        // swallow — the summary is the critical output.
      }
    }
  }
}

/** Mine one thread for an awaiting-reply chase + the user's commitments. */
async function detectFollowUps(
  deps: SummaryDeps,
  account: AccountContext,
  threadId: string,
  thread: ThreadForSummary,
  summary: string,
): Promise<void> {
  const now = (deps.now ?? ((): Date => new Date()))()
  const prompt = buildFollowUpDetectionPrompt(renderTranscript(thread))
  const detection = await deps.llm.complete({
    model: 'summary',
    system: prompt.system,
    messages: prompt.messages,
    maxTokens: DETECTION_MAX_TOKENS,
    responseFormat: { type: 'json' },
    thinking: { type: 'disabled' },
    userId: account.userId,
  })
  const found = parseFollowUpDetection(detection.json)
  if (!found) return

  // The other party = the latest inbound sender (who we're waiting on).
  const otherParty =
    [...thread.messages].reverse().find((m) => !m.outbound)?.from ??
    thread.messages[0]?.from ?? { name: '', email: '' }
  const counterpart = contactDisplay(otherParty)

  if (found.awaitingReply) {
    await deps.mail.createReminder({
      userId: account.userId,
      kind: 'follow-up',
      threadId,
      subject: thread.subject,
      context: summary,
      sender: counterpart,
      dueAt: dueDate(now, undefined, REMINDER_DUE_DAYS),
      draftReply: found.chaserDraft ?? undefined,
      crypto: account.crypto,
    })
  }

  for (const commitment of found.commitments) {
    await deps.mail.createCommitment({
      userId: account.userId,
      threadId,
      subject: thread.subject,
      text: commitment.text,
      counterpart,
      dueAt: dueDate(now, commitment.dueAt, COMMITMENT_DUE_DAYS),
      crypto: account.crypto,
    })
  }

  await deps.mail.increment(account.userId, 'ai_enrichments')
}
