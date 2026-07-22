/**
 * AI writing + chat — the streaming AI surface.
 *
 *  - `POST /ai/draft`  (`{ threadId?, prompt }`)  — SSE token stream of a reply
 *    draft (Sonnet). The user's decrypted `voice_profile` is folded into the
 *    instruction so drafts sound like them.
 *  - `POST /ai/rewrite` (`{ draft, tone? | instruction?, threadId? }`) — SSE token
 *    stream rewriting a supplied draft. (Supersedes the mock's
 *    `{ scenarioId, paragraphs }` shape — see the file's SSE contract below.)
 *  - `POST /ai/quick-replies` (`{ threadId }`) — non-streaming `{ replies: string[] }`.
 *  - `POST /ai/chat` (`{ threadId?, message }`) — RAG over the user's mailbox:
 *    embed the query, retrieve top-K message chunks by pgvector cosine ANN
 *    (RLS-scoped), decrypt them, stream the grounded answer, then a final
 *    `citations` event.
 *
 * SSE event contract (every `data` payload is JSON):
 *   draft / rewrite:  `token {text}` … then `done {stopReason, model}`
 *   chat:             `token {text}` … then `citations [{threadId,label}]` then `done`
 *   any stream error: `error {error}`
 *
 * Every call is metered (`usage_counters`) and the router keeps the per-IP rate
 * limiter ahead of the (expensive) model calls.
 */
import { Hono } from 'hono'
import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { withUser } from '@revido/db/client'
import type { DbTransaction } from '@revido/db/client'
import type { Ciphertext } from '@revido/db/crypto'
import type { Message, Thread } from '@revido/db'
import { buildChatPrompt, buildDraftPrompt, buildRewritePrompt } from '@revido/core'
import type {
  BuiltPrompt,
  LlmResult,
  OutputLanguageOptions,
  RetrievedChunk,
} from '@revido/core'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { getEmbeddingsClient, getLlmClient } from '../lib/ai'
import { rankChunks, type RankableChunk } from '../lib/chat-rank'
import { makePseudonymizer, type EntityInput } from '../lib/pii-pseudonymize'
import { loadThreadForPrompt, loadUserAiContext, type UserAiContext } from '../lib/ai-context'
import { getUserCrypto, type UserCrypto } from '../lib/crypto'
import { errorHandler, notFound, readJson } from '../lib/http'
import { enforceAiCap, recordAiUsage, UsageMetric } from '../lib/metering'
import { rateLimit } from '../lib/rate-limit'
import { requireUser, type Variables } from '../middleware/auth'

/** Sonnet — the writing/chat tier. */
const WRITE_MODEL = 'summary'
const DRAFT_MAX_TOKENS = 1024
const CHAT_MAX_TOKENS = 1024
const QUICK_REPLIES_MAX_TOKENS = 512
/** How many chunks the model finally sees (after re-ranking). */
const RETRIEVAL_K = 8
/** Wider ANN candidate pool re-ranked (recency + keyword) down to RETRIEVAL_K. */
const CANDIDATE_K = 24
/** Max prior turns of conversation history accepted for multi-turn follow-ups. */
const MAX_HISTORY = 8
/** Chars of body kept as a citation preview snippet. */
const SNIPPET_LEN = 140
/** Per-IP AI budget: bursts allowed, sustained abuse rejected. */
const AI_RATE_WINDOW_MS = 60_000
const AI_RATE_MAX = 40

const draftSchema = z.object({
  threadId: z.string().optional(),
  prompt: z.string().min(1),
})
const rewriteSchema = z.object({
  draft: z.string().min(1),
  tone: z.string().optional(),
  instruction: z.string().optional(),
  threadId: z.string().optional(),
  scenarioId: z.string().optional(),
})
const quickRepliesSchema = z.object({ threadId: z.string().min(1) })
const chatSchema = z.object({
  threadId: z.string().optional(),
  message: z.string().min(1),
  /** Prior turns (oldest→newest) for multi-turn follow-ups; capped server-side. */
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1) }))
    .optional(),
})

/** Strict-JSON shape asked of the model for quick replies. */
const QUICK_REPLIES_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['replies'],
  properties: {
    replies: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      items: { type: 'string' },
    },
  },
}

const QUICK_REPLIES_SYSTEM = `You suggest short, ready-to-send reply options for the latest message in an email thread on behalf of the Revido Mail user. Return three concise options (one sentence each, distinct in intent — e.g. accept, decline, ask a question), phrased in the first person and ready to send as-is. Do not fabricate facts, dates, or commitments. Return ONLY a JSON object of the form {"replies": ["…", "…", "…"]}.`

export const aiRouter = new Hono<{ Variables: Variables }>()
aiRouter.onError(errorHandler)
// Rate-limit BEFORE auth so a hostile caller can't force session lookups + model
// calls at will.
aiRouter.use('*', rateLimit({ windowMs: AI_RATE_WINDOW_MS, max: AI_RATE_MAX }))
aiRouter.use('*', requireUser)

// ---------------------------------------------------------------------------
// Prompt helpers
// ---------------------------------------------------------------------------

/** Build the language options for a thread-aware prompt. */
function langOpts(ai: UserAiContext, thread?: Thread): OutputLanguageOptions {
  const opts: OutputLanguageOptions = { outputLanguage: ai.outputLanguage }
  if (thread?.language) opts.detectedLanguage = thread.language
  return opts
}

/** Fold the learned voice profile into a draft instruction (never into the cached system prefix). */
function instructionWithVoice(prompt: string, voiceProfile?: string): string {
  if (!voiceProfile) return prompt
  return `${prompt}\n\nWrite in the user's established voice. Voice profile: ${voiceProfile}`
}

/** A minimal placeholder thread for a from-scratch (thread-less) draft. */
function emptyThread(): Thread {
  return {
    id: '',
    accountId: '',
    subject: '',
    participants: [],
    category: 'fyi',
    priority: 'normal',
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
    lastMessageAt: new Date(0).toISOString(),
    awaitingReply: false,
    labels: [],
  }
}

/** A compact transcript of the last few messages, for the quick-replies prompt. */
function renderRecent(messages: Message[], limit = 6): string {
  const recent = messages.slice(-limit)
  return recent
    .map((m) => {
      const who = m.outbound ? 'User' : m.from.name || m.from.email || 'Sender'
      const body = (m.text || m.html || '').replace(/\s+/g, ' ').trim().slice(0, 800)
      return `${who}: ${body}`
    })
    .join('\n\n')
}

// ---------------------------------------------------------------------------
// Streaming plumbing
// ---------------------------------------------------------------------------

/** Stream a text completion as `token` events followed by a terminal `done`. */
function textStream(c: Context, userId: string, built: BuiltPrompt, maxTokens: number): Response {
  const llm = getLlmClient()
  return streamSSE(c, async (stream) => {
    try {
      for await (const event of llm.stream({
        model: WRITE_MODEL,
        system: built.system,
        messages: built.messages,
        maxTokens,
        userId,
      })) {
        if (event.type === 'text') {
          await stream.writeSSE({ event: 'token', data: JSON.stringify({ text: event.text }) })
        } else {
          await stream.writeSSE({
            event: 'done',
            data: JSON.stringify({ stopReason: event.stopReason, model: event.model }),
          })
        }
      }
    } catch (err) {
      console.error('[api] ai stream failed', err)
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: 'ai_stream_failed' }) })
    }
  })
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** POST /ai/draft — stream a reply draft (in the user's voice when available). */
aiRouter.post('/draft', async (c) => {
  const userId = c.get('userId')
  const { threadId, prompt } = await readJson(c, draftSchema)
  await enforceAiCap(userId, UsageMetric.aiDrafts)
  const crypto = await getUserCrypto(userId)

  const built = await withUser(userId, async (tx) => {
    const ai = await loadUserAiContext(tx, crypto, userId)
    const instruction = instructionWithVoice(prompt, ai.voiceProfile)
    if (threadId) {
      const loaded = await loadThreadForPrompt(tx, crypto, threadId)
      if (!loaded) return undefined
      return buildDraftPrompt(loaded.thread, loaded.messages, langOpts(ai, loaded.thread), instruction)
    }
    return buildDraftPrompt(emptyThread(), [], langOpts(ai), instruction)
  })
  if (!built) return notFound(c)

  await recordAiUsage(userId, UsageMetric.aiDrafts)
  return textStream(c, userId, built, DRAFT_MAX_TOKENS)
})

/** POST /ai/rewrite — stream a rewrite of a supplied draft per a tone/instruction. */
aiRouter.post('/rewrite', async (c) => {
  const userId = c.get('userId')
  const body = await readJson(c, rewriteSchema)
  await enforceAiCap(userId, UsageMetric.aiDrafts)
  const crypto = await getUserCrypto(userId)

  const ai = await withUser(userId, (tx) => loadUserAiContext(tx, crypto, userId))
  const instruction =
    body.instruction ??
    (body.tone ? `Rewrite this draft in a ${body.tone} tone.` : 'Improve this draft.')
  const built = buildRewritePrompt(body.draft, instruction, { outputLanguage: ai.outputLanguage })

  await recordAiUsage(userId, UsageMetric.aiDrafts)
  return textStream(c, userId, built, DRAFT_MAX_TOKENS)
})

/** Pull `replies` out of a JSON completion, tolerating a non-conforming model. */
function parseReplies(result: LlmResult): string[] {
  const json = result.json
  if (json && typeof json === 'object' && Array.isArray((json as { replies?: unknown }).replies)) {
    return (json as { replies: unknown[] }).replies.filter((r): r is string => typeof r === 'string')
  }
  return []
}

/** POST /ai/quick-replies — non-streaming reply suggestions for a thread. */
aiRouter.post('/quick-replies', async (c) => {
  const userId = c.get('userId')
  const { threadId } = await readJson(c, quickRepliesSchema)
  await enforceAiCap(userId, UsageMetric.aiDrafts)
  const crypto = await getUserCrypto(userId)

  const prepared = await withUser(userId, async (tx) => {
    const ai = await loadUserAiContext(tx, crypto, userId)
    const loaded = await loadThreadForPrompt(tx, crypto, threadId)
    if (!loaded) return undefined
    return { ai, loaded }
  })
  if (!prepared) return notFound(c)

  const built: BuiltPrompt = {
    system: QUICK_REPLIES_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          `Subject: ${prepared.loaded.thread.subject}`,
          '',
          renderRecent(prepared.loaded.messages),
          '',
          'Suggest three short reply options as JSON.',
        ].join('\n'),
      },
    ],
  }

  const result = await getLlmClient().complete({
    model: WRITE_MODEL,
    system: built.system,
    messages: built.messages,
    maxTokens: QUICK_REPLIES_MAX_TOKENS,
    responseFormat: { type: 'json', schema: QUICK_REPLIES_JSON_SCHEMA },
    userId,
  })
  await recordAiUsage(userId, UsageMetric.aiDrafts)
  return c.json({ replies: parseReplies(result) })
})

// ---------------------------------------------------------------------------
// Chat RAG
// ---------------------------------------------------------------------------

/** A retrieved, decrypted message chunk + its thread for citation. */
interface Chunk extends RankableChunk {
  threadId: string
  subject: string
  text: string
  date: string
  distance: number
}

interface RetrievalRow {
  threadId: string
  date: string | Date
  textCt: Ciphertext | null
  subjectCt: Ciphertext | null
  distance: number
}

/** A citation the UI can open + preview: thread, subject, date, and a snippet. */
interface Citation {
  threadId: string
  label: string
  date?: string
  snippet?: string
}

/**
 * Retrieve chat context: pull a wide ANN candidate pool by pgvector cosine
 * distance over `message_embeddings` (RLS-scoped), decrypt it, then re-rank down
 * to RETRIEVAL_K with recency + keyword signals (see `chat-rank`). Bodies +
 * subjects are ciphertext at rest, so the lexical/recency legs run here after
 * decryption rather than in SQL; `messages.date` is plaintext, so the ANN query
 * carries it through for the recency signal.
 */
async function retrieveChunks(
  tx: DbTransaction,
  crypto: UserCrypto,
  userId: string,
  queryVector: number[],
  query: string,
): Promise<Chunk[]> {
  const literal = `[${queryVector.join(',')}]`
  const result = await tx.execute(sql`
    select
      m.thread_id as "threadId",
      m.date as "date",
      m.text_ct as "textCt",
      t.subject_ct as "subjectCt",
      (me.embedding <=> ${literal}::vector) as "distance"
    from message_embeddings me
    join messages m on m.id = me.message_id
    join threads t on t.id = m.thread_id
    where me.user_id = ${userId}
    order by me.embedding <=> ${literal}::vector
    limit ${CANDIDATE_K}
  `)
  const rows = result as unknown as RetrievalRow[]
  const candidates: Chunk[] = rows.map((r) => ({
    threadId: r.threadId,
    date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
    subject: crypto.decrypt(r.subjectCt),
    text: crypto.decrypt(r.textCt),
    distance: Number(r.distance),
  }))
  return rankChunks(candidates, query, { finalK: RETRIEVAL_K })
}

/** One citation per distinct source thread, in ranked order, with date + snippet. */
function dedupeCitations(chunks: Chunk[]): Citation[] {
  const seen = new Set<string>()
  const out: Citation[] = []
  for (const ch of chunks) {
    if (!ch.threadId || seen.has(ch.threadId)) continue
    seen.add(ch.threadId)
    const citation: Citation = { threadId: ch.threadId, label: ch.subject || ch.threadId }
    if (ch.date) citation.date = ch.date
    const snippet = ch.text.trim().replace(/\s+/g, ' ').slice(0, SNIPPET_LEN)
    if (snippet) citation.snippet = snippet
    out.push(citation)
  }
  return out
}

function toRetrievedChunk(ch: Chunk): RetrievedChunk {
  const chunk: RetrievedChunk = { text: ch.text }
  if (ch.subject) chunk.source = ch.subject
  if (ch.date) chunk.date = ch.date
  return chunk
}

/**
 * The plaintext contacts of the retrieved threads — the real names/emails to
 * pseudonymize before the prompt reaches the model. Contacts are plaintext
 * (identity metadata), so no decryption is needed.
 */
async function loadThreadContacts(
  tx: DbTransaction,
  userId: string,
  threadIds: string[],
): Promise<EntityInput[]> {
  if (threadIds.length === 0) return []
  const rows = (await tx.execute(sql`
    select distinct c.name as "name", c.email as "email"
    from thread_participants tp
    join contacts c on c.id = tp.contact_id
    where tp.user_id = ${userId} and tp.thread_id = any(${threadIds}::uuid[])
  `)) as unknown as EntityInput[]
  return rows
}

/** POST /ai/chat — grounded RAG answer over the user's mailbox, with citations. */
aiRouter.post('/chat', async (c) => {
  const userId = c.get('userId')
  const { message, history } = await readJson(c, chatSchema)
  await enforceAiCap(userId, UsageMetric.chatQueries)
  const crypto = await getUserCrypto(userId)

  const [queryVector] = await getEmbeddingsClient().embed([message], { inputType: 'query' })

  const { ai, chunks, contacts } = await withUser(userId, async (tx) => {
    const context = await loadUserAiContext(tx, crypto, userId)
    const retrieved = queryVector
      ? await retrieveChunks(tx, crypto, userId, queryVector, message)
      : []
    const people = await loadThreadContacts(tx, userId, [
      ...new Set(retrieved.map((r) => r.threadId)),
    ])
    return { ai: context, chunks: retrieved, contacts: people }
  })

  // Pseudonymize every real name/email BEFORE the model sees it (the gateway
  // scrubs real PII to placeholders; opaque tokens pass through). Encode the
  // whole prompt — context, question, and history — so a mention in any of them
  // maps to the same token, then restore real values as the answer streams back.
  const pseud = makePseudonymizer(contacts)
  const priorTurns = (history ?? [])
    .slice(-MAX_HISTORY)
    .map((t) => ({ role: t.role, content: pseud.encode(t.content) }))
  const promptChunks = chunks.map((ch) =>
    toRetrievedChunk({ ...ch, text: pseud.encode(ch.text), subject: pseud.encode(ch.subject) }),
  )
  const built = buildChatPrompt(
    pseud.encode(message),
    promptChunks,
    { outputLanguage: ai.outputLanguage },
    priorTurns,
  )
  // Citations are rendered by the app, not the model, so they keep the real subjects.
  const citations = dedupeCitations(chunks)

  await recordAiUsage(userId, UsageMetric.chatQueries)

  const llm = getLlmClient()
  return streamSSE(c, async (stream) => {
    const decoder = pseud.decoder()
    try {
      for await (const event of llm.stream({
        model: WRITE_MODEL,
        system: built.system,
        messages: built.messages,
        maxTokens: CHAT_MAX_TOKENS,
        userId,
      })) {
        if (event.type === 'text') {
          const text = decoder.push(event.text)
          if (text) await stream.writeSSE({ event: 'token', data: JSON.stringify({ text }) })
        } else {
          const tail = decoder.flush()
          if (tail) await stream.writeSSE({ event: 'token', data: JSON.stringify({ text: tail }) })
          await stream.writeSSE({ event: 'citations', data: JSON.stringify(citations) })
          await stream.writeSSE({
            event: 'done',
            data: JSON.stringify({ stopReason: event.stopReason, model: event.model }),
          })
        }
      }
    } catch (err) {
      console.error('[api] ai chat stream failed', err)
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: 'ai_stream_failed' }) })
    }
  })
})
