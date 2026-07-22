/**
 * AI prompt builders (W5/W6/W7) — provider-agnostic, cache-friendly.
 *
 * Every builder returns a stable system prefix (frozen: no timestamps/user ids,
 * so prompt caching works) plus the volatile per-thread content after the last
 * cache breakpoint. Triage pads the taxonomy+rubric past Haiku's 4096-token
 * minimum cacheable prefix. Filled in by Wave 1 `core-domain`; wired to the
 * Anthropic SDK by the Wave 2 `enrichment` agent.
 *
 * This stub freezes the shared shapes.
 */

import type { CategoryId, Message, OutputLanguage, Thread } from '@revido/db'
import { TRIAGE_SYSTEM_PROMPT } from './prompt-builders/taxonomy'
import {
  MULTILINGUAL_POLICY,
  outputLanguageDirective,
  renderThreadTranscript,
  userTurn,
} from './prompt-builders/shared'

/** A message block ready to hand to the Anthropic SDK. */
export interface PromptMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface BuiltPrompt {
  /** Frozen, cacheable system prefix. */
  system: string
  messages: PromptMessage[]
}

/** Strict structured-output shape for Haiku triage (category + priority + tldr + language). */
export interface TriageResult {
  category: CategoryId
  priorityScore: number
  priority: 'urgent' | 'high' | 'normal' | 'low'
  tldr: string
  /** BCP-47-ish language tag detected from the message ('en' | 'nl' | ...). */
  language: string
}

export interface OutputLanguageOptions {
  /** User's output-language preference; 'match' echoes the email's language. */
  outputLanguage: OutputLanguage
  /** Detected language of the source content, used when outputLanguage = 'match'. */
  detectedLanguage?: string
}

// Re-export the frozen triage system prefix so consumers can inspect / cache it.
export { TRIAGE_SYSTEM_PROMPT } from './prompt-builders/taxonomy'
// Content classifier for hybrid forwarding-rule conditions.
export {
  buildContentClassifierPrompt,
  CONTENT_CLASSIFIER_SCHEMA,
  type ContentClassifierPrompt,
} from './prompt-builders/content-classifier'

/**
 * The message shape triage runs over. Decoupled from both `RawFetchedMessage`
 * (adapter output) and the db `Message` so either can be adapted into it — note
 * that the db `Message` carries no subject (subject lives on `Thread`), so the
 * caller supplies it here.
 */
export interface TriageMessageInput {
  from: { name: string; email: string }
  to?: { name: string; email: string }[]
  subject: string
  date?: string
  /** Plain-text body (HTML should be stripped before triage). */
  body: string
}

/** A retrieved context chunk for RAG chat (from pgvector search). */
export interface RetrievedChunk {
  /** Stable id/citation handle for the chunk. */
  id?: string
  /** Human-readable source, e.g. a subject + sender. */
  source?: string
  /** ISO date of the underlying message, when known. */
  date?: string
  text: string
}

function contact(c: { name: string; email: string }): string {
  return c.name ? `${c.name} <${c.email}>` : c.email
}

/**
 * Triage prompt for Claude Haiku. `system` is the STABLE, cache-friendly prefix
 * (the nine-category taxonomy + priority rubric + language rules, padded past
 * Haiku's 4096-token minimum cacheable prefix). The volatile message content
 * goes in the single user turn, which asks for strict JSON matching
 * `TriageResult`.
 */
export function buildTriagePrompt(message: TriageMessageInput): BuiltPrompt {
  const header = [
    `From: ${contact(message.from)}`,
    message.to && message.to.length ? `To: ${message.to.map(contact).join(', ')}` : '',
    `Subject: ${message.subject}`,
    message.date ? `Date: ${message.date}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const content = [
    'Triage this email. Return ONLY the JSON object described in your instructions.',
    '<email>',
    header,
    '',
    message.body,
    '</email>',
  ].join('\n')

  return {
    system: TRIAGE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
  }
}

const SUMMARY_SYSTEM = `You summarize email threads for a busy person using Revido Mail. Produce a tight, faithful summary of the conversation: what it is about, where it stands, and what — if anything — the reader must do next. Lead with the single most important point. Be concrete: keep names, amounts, dates, and decisions. Never invent details that are not present, and never include a greeting, sign-off, or marketing language. Aim for two to four sentences of prose; if there are clear action items, list them briefly after the summary. ${MULTILINGUAL_POLICY}`

/** Summarize a thread. Stable system prefix; thread + language directive in the user turn. */
export function buildSummaryPrompt(
  thread: Thread,
  messages: Message[],
  opts: OutputLanguageOptions,
): BuiltPrompt {
  return {
    system: SUMMARY_SYSTEM,
    messages: userTurn(
      outputLanguageDirective(opts),
      'Summarize the following email thread.',
      renderThreadTranscript(thread, messages),
    ),
  }
}

const DRAFT_SYSTEM = `You draft email replies on behalf of the Revido Mail user. Write a complete, ready-to-send reply that answers the latest message in the thread and moves it forward. Match the tone and formality of the conversation, be concise and warm, and address every open question or request. Do not fabricate facts, commitments, dates, or figures the user has not provided; when something is genuinely unknown, use a clearly bracketed placeholder like [confirm date]. Output only the reply body — no subject line, no "Here is a draft" preamble, and no quoted prior message. ${MULTILINGUAL_POLICY}`

/**
 * Draft a reply to a thread. Optional `instruction` steers the draft (tone,
 * intent, key points the user wants included).
 */
export function buildDraftPrompt(
  thread: Thread,
  messages: Message[],
  opts: OutputLanguageOptions,
  instruction?: string,
): BuiltPrompt {
  return {
    system: DRAFT_SYSTEM,
    messages: userTurn(
      outputLanguageDirective(opts),
      instruction ? `Guidance for this reply: ${instruction}` : 'Draft a suitable reply.',
      renderThreadTranscript(thread, messages),
    ),
  }
}

const REWRITE_SYSTEM = `You rewrite a draft email for the Revido Mail user according to their instruction (for example: make it shorter, warmer, more formal, more direct, or fix the tone). Preserve the draft's meaning, facts, names, and any bracketed placeholders exactly; change only what the instruction asks for. Output only the rewritten email body — no commentary, no explanation of what you changed. ${MULTILINGUAL_POLICY}`

/** Rewrite an existing draft per an instruction. */
export function buildRewritePrompt(
  draft: string,
  instruction: string,
  opts: OutputLanguageOptions,
): BuiltPrompt {
  return {
    system: REWRITE_SYSTEM,
    messages: userTurn(
      outputLanguageDirective(opts),
      `Rewrite the draft below. Instruction: ${instruction}`,
      '<draft>',
      draft,
      '</draft>',
    ),
  }
}

const CHAT_SYSTEM = `You are the Revido Mail assistant. You answer the user's questions about their mailbox using ONLY the retrieved email excerpts provided in the user turn. Rules:
- Ground every factual claim in the excerpts and cite the source by its bracketed label when you state a fact.
- Each excerpt is labelled with its subject and an ISO date. When the question is about what is "latest", "last", "recent", or "newest", answer from the excerpt with the most recent date — state that date.
- Use real names, companies, amounts, and dates exactly as they appear; never replace them with placeholders.
- The excerpts are ordered most-relevant first, but a later excerpt can still hold the answer — read them all.
- If the excerpts do not contain the answer, say so plainly rather than guessing, and suggest how the user might rephrase.
- Prior turns in this conversation are for context (follow-ups); still ground new claims in the excerpts.
Be concise and direct. ${MULTILINGUAL_POLICY}`

/**
 * RAG chat over retrieved mailbox chunks. `history` carries prior conversation
 * turns (oldest→newest) so follow-ups keep context; the retrieved context +
 * current question are always the final user turn.
 */
export function buildChatPrompt(
  query: string,
  retrievedChunks: RetrievedChunk[],
  opts: OutputLanguageOptions,
  history: readonly PromptMessage[] = [],
): BuiltPrompt {
  const context = retrievedChunks.length
    ? retrievedChunks
        .map((c, i) => {
          const label = c.source ?? c.id ?? `chunk-${i + 1}`
          const meta = c.date ? ` (${c.date})` : ''
          return `[${label}${meta}]\n${c.text}`
        })
        .join('\n\n')
    : '(no relevant email excerpts were retrieved)'

  return {
    system: CHAT_SYSTEM,
    messages: [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      ...userTurn(
        outputLanguageDirective(opts),
        '<context>',
        context,
        '</context>',
        `Question: ${query}`,
      ),
    ],
  }
}
