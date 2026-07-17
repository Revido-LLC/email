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
import { AGENT_ACTION_TYPES, agentPlanSchema, compilePredicate } from '@revido/core/agent-plan'
import { desc, gte } from 'drizzle-orm'
import { z } from 'zod'
import { getLlmClient } from '../lib/ai'
import { getUserCrypto } from '../lib/crypto'
import { errorHandler, HttpError, readJson } from '../lib/http'
import { assembleThreads } from '../lib/mappers'
import { enforceAiCap, recordAiUsage, UsageMetric } from '../lib/metering'
import { rateLimit } from '../lib/rate-limit'
import { requireUser, type Variables } from '../middleware/auth'

const COMPILE_MAX_TOKENS = 1024
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const COMPILE_RATE_WINDOW_MS = 60_000
const COMPILE_RATE_MAX = 20

const compileSchema = z.object({ description: z.string().min(1) })
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

const COMPILE_SYSTEM = `You compile a Revido Mail user's natural-language inbox rule into a strict JSON agent plan. The plan has:
- "trigger": "new-mail" (evaluate each newly arrived thread) or "scheduled" (run on a cadence). Use "scheduled" only when the rule is explicitly time-based, and then also set "schedule" to a short cron-like or human cadence string.
- "conditions": an array of {"field","op","value"} clauses, ALL of which must hold. Valid fields include category, subject, priority, priorityScore, from, participant, label, language, awaitingReply, unread, starred, hasAttachments, snoozed. Valid ops: is, is-not, contains, not-contains, matches (regex), gt, lt. Values are always strings. An empty array means "every thread".
- "actions": an array of {"type","label"} the agent performs when the conditions match. Valid types: ${AGENT_ACTION_TYPES.join(', ')}. "label" is a short human description of the action. Prefer the least destructive action set that satisfies the rule.
Return ONLY the JSON object — no prose, no code fence.`

export const agentsAiRouter = new Hono<{ Variables: Variables }>()
agentsAiRouter.onError(errorHandler)
// Guard the Opus compile path per-IP before auth; dry-run is cheap but shares it.
agentsAiRouter.use('*', rateLimit({ windowMs: COMPILE_RATE_WINDOW_MS, max: COMPILE_RATE_MAX }))
agentsAiRouter.use('*', requireUser)

/** POST /agents/compile — natural-language rule → validated `AgentPlan` (Opus). */
agentsAiRouter.post('/compile', async (c) => {
  const userId = c.get('userId')
  const { description } = await readJson(c, compileSchema)
  await enforceAiCap(userId, UsageMetric.agentCompiles)

  const result = await getLlmClient().complete({
    model: 'escalation',
    system: COMPILE_SYSTEM,
    messages: [
      { role: 'user', content: `Compile this inbox rule into an agent plan:\n\n${description}` },
    ],
    maxTokens: COMPILE_MAX_TOKENS,
    responseFormat: { type: 'json', schema: AGENT_PLAN_JSON_SCHEMA },
    userId,
  })

  const parsed = agentPlanSchema.safeParse(result.json)
  if (!parsed.success) {
    throw new HttpError(422, 'compile_failed', 'The model did not return a valid agent plan.')
  }
  await recordAiUsage(userId, UsageMetric.agentCompiles)
  return c.json(parsed.data)
})

/** POST /agents/dry-run — run a plan's predicate over the last 30 days of threads. */
agentsAiRouter.post('/dry-run', async (c) => {
  const userId = c.get('userId')
  const { plan } = await readJson(c, dryRunSchema)
  const predicate = compilePredicate(plan)
  const crypto = await getUserCrypto(userId)
  const since = new Date(Date.now() - THIRTY_DAYS_MS)

  const matches = await withUser(userId, async (tx) => {
    const rows = await tx
      .select()
      .from(threads)
      .where(gte(threads.lastMessageAt, since))
      .orderBy(desc(threads.lastMessageAt))
    const assembled = await assembleThreads(tx, crypto, rows)
    return assembled.filter(predicate)
  })
  return c.json({ matches })
})
