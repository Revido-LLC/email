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

import type { Message, Thread } from '@revido/db'
import { buildSummaryPrompt } from '@revido/core'
import type { AccountContext } from '../db/accounts'
import type { EnrichStore, ThreadForSummary } from '../mail/store'
import type { WorkerLlmClient } from '../llm'
import type { JobConsumer } from '../queue/runner'
import type { LlmThinking } from '@revido/core'
import { summaryPayload } from '../queue/jobs'

/** Threads at/above this size — or flagged urgent — escalate to Opus. */
const ESCALATE_MESSAGE_COUNT = 8
const SUMMARY_MAX_TOKENS = 1024

export interface SummaryDeps {
  loadAccount(accountId: string): Promise<AccountContext>
  mail: Pick<EnrichStore, 'getThread' | 'applySummary'>
  llm: Pick<WorkerLlmClient, 'complete'>
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
  }
}
