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
import {
  AGENT_ACTION_TYPES,
  agentPlanSchema,
  contentClauses,
  type AgentPlan,
} from '@revido/core/agent-plan'
import {
  buildContentClassifierPrompt,
  CONTENT_CLASSIFIER_SCHEMA,
  planContentEvaluation,
} from '@revido/core'
import { desc, gte } from 'drizzle-orm'
import { z } from 'zod'
import { getLlmClient } from '../lib/ai'
import { loadThreadForPrompt } from '../lib/ai-context'
import { makePseudonymizer } from '../lib/pii-pseudonymize'
import { getUserCrypto } from '../lib/crypto'
import { errorHandler, HttpError, readJson } from '../lib/http'
import { assembleThreads } from '../lib/mappers'
import { enforceAiCap, recordAiUsage, UsageMetric } from '../lib/metering'
import { rateLimit } from '../lib/rate-limit'
import { requireUser, type Variables } from '../middleware/auth'

const COMPILE_MAX_TOKENS = 1024
/** Compile retries: the escalation model occasionally emits non-parseable output on
 * providers that don't enforce json_schema — a retry almost always lands a valid plan. */
const COMPILE_MAX_ATTEMPTS = 3
const CLARIFY_MAX_TOKENS = 512
const CLARIFY_MAX_QUESTIONS = 3
/** Loose email matcher for recovering a forward destination the PII-scrub redacted. */
const EMAIL_RE = /[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+/
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

/**
 * JSON Schema forwarded to the model as a structured-output constraint. Mirrors
 * `agentPlanSchema`, but written to satisfy OpenAI/Azure STRICT structured outputs
 * (OpenRouter sends `strict: true` whenever a schema is present): EVERY property
 * must appear in `required`, `additionalProperties` must be `false` (no open-ended
 * maps), and `minItems`/`maxItems` are unsupported. Optional fields are expressed
 * as nullable (`type: [..., 'null']`) and normalized back before Zod validation
 * (see `normalizePlan`). This keeps shape enforcement AND works on every provider
 * (an open `params` map or a missing-from-required `schedule` 400s on Azure).
 */
export const AGENT_PLAN_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['trigger', 'schedule', 'conditions', 'actions'],
  properties: {
    trigger: { type: 'string', enum: ['new-mail', 'scheduled'] },
    schedule: { type: ['string', 'null'] },
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
        required: ['type', 'label', 'params'],
        properties: {
          type: { type: 'string', enum: [...AGENT_ACTION_TYPES] },
          label: { type: 'string' },
          // Fixed nullable shape (strict mode forbids open maps). `to` = forward
          // destination; `label`/`value` = label target. Nulls stripped in `normalizePlan`.
          params: {
            type: ['object', 'null'],
            additionalProperties: false,
            required: ['to', 'label', 'value'],
            properties: {
              to: { type: ['string', 'null'] },
              label: { type: ['string', 'null'] },
              value: { type: ['string', 'null'] },
            },
          },
        },
      },
    },
  },
}

/**
 * Reconcile a strict-schema model result with `agentPlanSchema`: drop null
 * `schedule`, and collapse each action's fixed nullable `params` object into the
 * sparse `Record<string,string>` the Zod schema expects (nulls/empties removed;
 * an all-null params becomes absent).
 */
export function normalizePlan(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const plan = raw as Record<string, unknown>
  const out: Record<string, unknown> = { ...plan }
  if (out.schedule == null) delete out.schedule
  if (Array.isArray(out.actions)) {
    out.actions = out.actions.map((a) => {
      if (!a || typeof a !== 'object') return a
      const action = a as Record<string, unknown>
      const next: Record<string, unknown> = { type: action.type, label: action.label }
      const p = action.params
      if (p && typeof p === 'object') {
        const params: Record<string, string> = {}
        for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
          if (typeof v === 'string' && v !== '') params[k] = v
        }
        // Keep an explicit empty forward destination so the UI can prompt for it.
        if ('to' in (p as object) && (p as Record<string, unknown>).to === '') params.to = ''
        if (Object.keys(params).length > 0) next.params = params
      }
      return next
    })
  }
  return out
}

/**
 * The OpenRouter account PII-scrub can redact the forward address in the model's
 * output to a placeholder (e.g. `[EMAIL]`). Recover the real destination from the
 * user's own description (which we never send through the scrub-affected path) when
 * the compiled `to` isn't a valid email, so the wizard pre-fills the right address.
 */
function repairForwardDestination(plan: AgentPlan, description: string): AgentPlan {
  const fromDesc = description.match(EMAIL_RE)?.[0]
  return {
    ...plan,
    actions: plan.actions.map((a) => {
      if (a.type !== 'forward') return a
      const to = a.params?.to
      if (to && EMAIL_RE.test(to)) return a
      return { ...a, params: { ...(a.params ?? {}), to: fromDesc ?? '' } }
    }),
  }
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

  const userContent = `Compile this inbox rule into an agent plan:\n\n${description}${clarifications}`
  // Pseudonymize emails in the rule before the model (and the account PII-scrub) see
  // them: each becomes an opaque `Mailbox_N` token the scrub passes through, and we
  // decode the plan's string fields back afterwards. So the compiled `to`/sender values
  // are the real ones regardless of the scrub setting — not a placeholder to recover.
  const pseudo = makePseudonymizer([])
  const safeContent = pseudo.encode(userContent)
  const llm = getLlmClient()
  let plan: AgentPlan | null = null
  for (let attempt = 0; attempt < COMPILE_MAX_ATTEMPTS && !plan; attempt++) {
    const result = await llm.complete({
      model: 'escalation',
      system: COMPILE_SYSTEM,
      messages: [{ role: 'user', content: safeContent }],
      maxTokens: COMPILE_MAX_TOKENS,
      responseFormat: { type: 'json', schema: AGENT_PLAN_JSON_SCHEMA },
      userId,
    })
    let decoded: unknown = result.json
    if (decoded != null && pseudo.size() > 0) {
      try {
        decoded = JSON.parse(pseudo.decode(JSON.stringify(decoded)))
      } catch {
        decoded = result.json
      }
    }
    const parsed = agentPlanSchema.safeParse(normalizePlan(decoded))
    if (parsed.success) plan = parsed.data
  }
  if (!plan) {
    throw new HttpError(422, 'compile_failed', 'The model did not return a valid agent plan.')
  }
  await recordAiUsage(userId, UsageMetric.agentCompiles)
  return c.json(repairForwardDestination(plan, description))
})

/** POST /agents/clarify — grounded, pre-answered refining questions (cheap model). */
agentsAiRouter.post('/clarify', async (c) => {
  const userId = c.get('userId')
  const { description } = await readJson(c, clarifySchema)
  await enforceAiCap(userId, UsageMetric.agentClarifies)

  const llm = getLlmClient()
  let questions: z.infer<typeof clarifyResponseSchema>['questions'] = []
  // Retry once if the model returns nothing usable (provider json_schema variance).
  for (let attempt = 0; attempt < 2 && questions.length === 0; attempt++) {
    const result = await llm.complete({
      model: 'summary',
      system: CLARIFY_SYSTEM,
      messages: [{ role: 'user', content: `The user's rule idea:\n\n${description}` }],
      maxTokens: CLARIFY_MAX_TOKENS,
      responseFormat: { type: 'json', schema: CLARIFY_JSON_SCHEMA },
      userId,
    })
    const parsed = clarifyResponseSchema.safeParse(result.json)
    if (parsed.success) questions = parsed.data.questions.slice(0, CLARIFY_MAX_QUESTIONS)
  }
  // Graceful degradation: still empty ⇒ the wizard simply skips the Refine step.
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
