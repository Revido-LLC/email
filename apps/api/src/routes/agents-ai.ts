/**
 * Agent authoring AI — the two model-backed steps of the create-agent wizard.
 *
 *  - `POST /agents/compile` (`{ description }`) — turn a natural-language rule into
 *    a structured `AgentPlan`. Runs Opus (`escalation`) with a strict-JSON
 *    structured-output constraint (the agent-plan JSON schema), then re-validates
 *    the result with `agentPlanSchema` before returning it.
 *  - `POST /agents/dry-run` (`{ plan }`) — compile the plan into a `Thread`
 *    predicate and run it over the caller's last 30 days of threads (RLS-scoped,
 *    decrypted) → `{ matches: Thread[] }`. No model call.
 *
 * Mounted at `/agents` alongside the CRUD `agentsRouter`; the two share the base
 * path (Hono merges the route tables) but own disjoint sub-paths.
 */
import { Hono } from 'hono'
import { withUser } from '@revido/db/client'
import { threads } from '@revido/db/schema'
import { AGENT_ACTION_TYPES, agentPlanSchema, contentClauses } from '@revido/core/agent-plan'
import {
  buildContentClassifierPrompt,
  CONTENT_CLASSIFIER_SCHEMA,
  planContentEvaluation,
} from '@revido/core'
import { desc, gte } from 'drizzle-orm'
import { z } from 'zod'
import { getLlmClient } from '../lib/ai'
import { loadThreadForPrompt } from '../lib/ai-context'
import { getUserCrypto } from '../lib/crypto'
import { errorHandler, HttpError, readJson } from '../lib/http'
import { assembleThreads } from '../lib/mappers'
import { enforceAiCap, recordAiUsage, UsageMetric } from '../lib/metering'
import { rateLimit } from '../lib/rate-limit'
import { requireUser, type Variables } from '../middleware/auth'

const COMPILE_MAX_TOKENS = 1024
const CLARIFY_MAX_TOKENS = 512
const CLARIFY_MAX_QUESTIONS = 3
const PREVIEW_AI_CAP = 10
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const COMPILE_RATE_WINDOW_MS = 60_000
const COMPILE_RATE_MAX = 20

const compileSchema = z.object({
  description: z.string().min(1),
  answers: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
})
const clarifySchema = z.object({ description: z.string().min(1) })
const clarifyResponseSchema = z.object({
  questions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      options: z.array(z.object({ id: z.string(), label: z.string() })),
      multi: z.boolean(),
      defaultOptionIds: z.array(z.string()),
    }),
  ),
})
const dryRunSchema = z.object({ plan: agentPlanSchema })

/** JSON Schema forwarded to the model as a structured-output constraint. Mirrors `agentPlanSchema`. */
export const AGENT_PLAN_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['trigger', 'conditions', 'actions'],
  properties: {
    trigger: { type: 'string', enum: ['new-mail', 'scheduled'] },
    schedule: { type: 'string' },
    conditions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'op', 'value'],
        properties: {
          field: { type: 'string' },
          op: {
            type: 'string',
            enum: ['is', 'is-not', 'contains', 'not-contains', 'matches', 'gt', 'lt'],
          },
          value: { type: 'string' },
        },
      },
    },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'label'],
        properties: {
          type: { type: 'string', enum: [...AGENT_ACTION_TYPES] },
          label: { type: 'string' },
          params: { type: 'object', additionalProperties: { type: 'string' } },
        },
      },
    },
  },
}

export const COMPILE_SYSTEM = `You compile a Revido Mail user's natural-language inbox rule into a strict JSON agent plan. The plan has:
- "trigger": "new-mail" (evaluate each newly arrived thread) or "scheduled" (run on a cadence). Use "scheduled" only when the rule is explicitly time-based, and then also set "schedule" to a short cron-like or human cadence string.
- "conditions": an array of {"field","op","value"} clauses, ALL of which must hold. Valid fields include category, subject, priority, priorityScore, from, participant, label, language, awaitingReply, unread, starred, hasAttachments, snoozed. Valid ops: is, is-not, contains, not-contains, matches (regex), gt, lt. Values are always strings. An empty array means "every thread".
  There is also a special "content" field: its "value" is a short natural-language description of what the message OR its attachment IS — e.g. "an invoice or receipt", "a signed contract", "a shipping notification". Use "content" ONLY when the rule depends on what the document actually is, not on metadata; combine it with cheap metadata clauses (e.g. hasAttachments is true) when the user implies them. Prefer "op":"is" for content clauses. For a "receipt" rule, phrase the content value as "a merchant's receipt for a completed payment (an itemized proof of purchase from the seller) — NOT an invoice or bill requesting payment, NOT a past-due or failed-payment notice, and NOT a bank or payment-processor charge alert (e.g. Wise, PayPal, Revolut, Stripe, or a card issuer merely notifying you that money left your account)", and pair it with the cheapest metadata gate the user implied (e.g. hasAttachments is true).
- "actions": an array of {"type","label"} — plus "params" where noted — the agent performs when the conditions match. Valid types: ${AGENT_ACTION_TYPES.join(', ')}. "label" is a short human description of the action. Prefer the least destructive action set that satisfies the rule.
  For a "forward" action you MUST include "params": {"to": "<recipient email address>"} taken from the rule. If the rule asks to forward but names no address, still emit the forward action with "params": {"to": ""} so the app can ask the user for it.
Return ONLY the JSON object — no prose, no code fence.`

/** Structured-output constraint for the clarify step. */
export const CLARIFY_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      maxItems: CLARIFY_MAX_QUESTIONS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'question', 'options', 'multi', 'defaultOptionIds'],
        properties: {
          id: { type: 'string' },
          question: { type: 'string' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'label'],
              properties: { id: { type: 'string' }, label: { type: 'string' } },
            },
          },
          multi: { type: 'boolean' },
          defaultOptionIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

export const CLARIFY_SYSTEM = `You help a Revido Mail user turn a rough inbox-automation idea into a precise rule by asking at most ${CLARIFY_MAX_QUESTIONS} short, high-value multiple-choice questions. Only ask about real matching levers the system can honour: whether to require an attachment; which senders or domains; the exact category; whether an amount must be present; forward automatically vs. hold each for one-tap approval; and — when the rule names a document type like "receipt" — what counts (e.g. real receipts only vs. also invoices, bills, and past-due/failed-payment notices). For EACH question give 2–4 options and PRE-SELECT your single best-guess default in "defaultOptionIds" (one id, unless "multi" is true) so the user can just click through. Never ask about anything the rule already makes explicit. Return ONLY the JSON object.`

export const agentsAiRouter = new Hono<{ Variables: Variables }>()
agentsAiRouter.onError(errorHandler)
// Guard the Opus compile path per-IP before auth; dry-run is cheap but shares it.
agentsAiRouter.use('*', rateLimit({ windowMs: COMPILE_RATE_WINDOW_MS, max: COMPILE_RATE_MAX }))
agentsAiRouter.use('*', requireUser)

/** POST /agents/compile — natural-language rule → validated `AgentPlan` (Opus). */
agentsAiRouter.post('/compile', async (c) => {
  const userId = c.get('userId')
  const { description, answers } = await readJson(c, compileSchema)
  await enforceAiCap(userId, UsageMetric.agentCompiles)

  const clarifications =
    answers && answers.length
      ? `\n\nThe user answered these clarifying questions — honour them:\n` +
        answers.map((a) => `- ${a.question} → ${a.answer}`).join('\n')
      : ''

  const result = await getLlmClient().complete({
    model: 'escalation',
    system: COMPILE_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Compile this inbox rule into an agent plan:\n\n${description}${clarifications}`,
      },
    ],
    maxTokens: COMPILE_MAX_TOKENS,
    // Plain JSON mode (not strict json_schema): the agent plan needs an open-ended
    // `params` map, which OpenAI/Azure strict structured-outputs cannot express and
    // reject with a 400. The shape is described in COMPILE_SYSTEM and enforced by
    // `agentPlanSchema` below.
    responseFormat: { type: 'json' },
    userId,
  })

  const parsed = agentPlanSchema.safeParse(result.json)
  if (!parsed.success) {
    throw new HttpError(422, 'compile_failed', 'The model did not return a valid agent plan.')
  }
  await recordAiUsage(userId, UsageMetric.agentCompiles)
  return c.json(parsed.data)
})

/** POST /agents/clarify — grounded, pre-answered refining questions (cheap model). */
agentsAiRouter.post('/clarify', async (c) => {
  const userId = c.get('userId')
  const { description } = await readJson(c, clarifySchema)
  await enforceAiCap(userId, UsageMetric.agentClarifies)

  const result = await getLlmClient().complete({
    model: 'summary',
    system: CLARIFY_SYSTEM,
    messages: [{ role: 'user', content: `The user's rule idea:\n\n${description}` }],
    maxTokens: CLARIFY_MAX_TOKENS,
    // Plain JSON mode — strict json_schema rejects `maxItems` (Azure 400). The shape
    // is described in CLARIFY_SYSTEM and validated by `clarifyResponseSchema` below.
    responseFormat: { type: 'json' },
    userId,
  })

  const parsed = clarifyResponseSchema.safeParse(result.json)
  // Graceful degradation: a bad/empty result simply skips the step (no questions).
  const questions = parsed.success ? parsed.data.questions.slice(0, CLARIFY_MAX_QUESTIONS) : []
  await recordAiUsage(userId, UsageMetric.agentClarifies)
  return c.json({ questions })
})

/** POST /agents/dry-run — shared pipeline preview over the last 30 days. */
agentsAiRouter.post('/dry-run', async (c) => {
  const userId = c.get('userId')
  const { plan } = await readJson(c, dryRunSchema)
  const crypto = await getUserCrypto(userId)
  const since = new Date(Date.now() - THIRTY_DAYS_MS)
  const llm = getLlmClient()

  const body = await withUser(userId, async (tx) => {
    const rows = await tx
      .select()
      .from(threads)
      .where(gte(threads.lastMessageAt, since))
      .orderBy(desc(threads.lastMessageAt))
    const assembled = await assembleThreads(tx, crypto, rows)

    const evaluated = planContentEvaluation(plan, assembled)
    const matched = [...evaluated.autoMatched]

    // Capped, fail-closed AI classify over a sample of the pre-filter survivors.
    const clause = contentClauses(plan)[0]?.value ?? ''
    const sample = evaluated.needsAi.slice(0, PREVIEW_AI_CAP)
    let hits = 0
    for (const thread of sample) {
      if (await classifyOne(tx, crypto, llm, userId, thread.id, clause)) {
        matched.push(thread)
        hits += 1
      }
    }

    const sampledCount = sample.length
    const remaining = evaluated.needsAi.length - sampledCount
    const rate = sampledCount > 0 ? hits / sampledCount : 0
    const estimatedMatches = matched.length + Math.round(remaining * rate)

    const reasonCounts = new Map<string, number>()
    for (const e of evaluated.excluded) {
      reasonCounts.set(e.reason, (reasonCounts.get(e.reason) ?? 0) + 1)
    }

    return {
      matched,
      candidateCount:
        evaluated.autoMatched.length + evaluated.needsAi.length + evaluated.excluded.length,
      excludedCount: evaluated.excluded.length,
      excludedReasons: [...reasonCounts].map(([label, count]) => ({ label, count })),
      sampledCount,
      estimatedMatches,
    }
  })

  return c.json(body)
})

type DryRunTx = Parameters<Parameters<typeof withUser>[1]>[0]

/** Classify one thread against a content predicate; fail-closed (any error ⇒ false). */
async function classifyOne(
  tx: DryRunTx,
  crypto: Awaited<ReturnType<typeof getUserCrypto>>,
  llm: ReturnType<typeof getLlmClient>,
  userId: string,
  threadId: string,
  predicate: string,
): Promise<boolean> {
  if (!predicate) return true
  try {
    const loaded = await loadThreadForPrompt(tx, crypto, threadId)
    if (!loaded || loaded.messages.length === 0) return false
    const text = [loaded.thread.subject, ...loaded.messages.map((m) => m.text || m.html || '')]
      .join('\n\n')
      .trim()
    if (!text) return false
    const prompt = buildContentClassifierPrompt(text, predicate)
    const result = await llm.complete({
      model: 'triage',
      system: prompt.system,
      messages: prompt.messages,
      maxTokens: 64,
      responseFormat: { type: 'json', schema: CONTENT_CLASSIFIER_SCHEMA },
      userId,
    })
    return (result.json as { match?: unknown } | undefined)?.match === true
  } catch {
    return false
  }
}
