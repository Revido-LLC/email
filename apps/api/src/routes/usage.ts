/**
 * `GET /usage` — the Usage tab's metering counters for the current month.
 *
 * Reads `usage_counters` (user-scoped, plaintext) for the current period and maps
 * the metering metric names the worker increments (`ai_drafts`, `agent_runs`,
 * `chat_queries`) into the `{ aiDrafts, agentRuns, chatQueries }` shape the UI
 * expects. Missing metrics read as 0.
 */
import { withUser } from '@revido/db/client'
import { usageCounters } from '@revido/db/schema'
import { and, eq } from 'drizzle-orm'
import { protectedRouter } from '../lib/protected'

export const usageRouter = protectedRouter()

/** ISO month bucket, e.g. "2026-07". */
function currentPeriod(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7)
}

const METRIC_AI_DRAFTS = 'ai_drafts'
const METRIC_AGENT_RUNS = 'agent_runs'
const METRIC_CHAT_QUERIES = 'chat_queries'

/** GET /usage — current-month counters. */
usageRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const period = currentPeriod()
  const counters = await withUser(userId, async (tx) => {
    return tx
      .select({ metric: usageCounters.metric, count: usageCounters.count })
      .from(usageCounters)
      .where(and(eq(usageCounters.userId, userId), eq(usageCounters.period, period)))
  })
  const byMetric = new Map(counters.map((r) => [r.metric, r.count]))
  return c.json({
    aiDrafts: byMetric.get(METRIC_AI_DRAFTS) ?? 0,
    agentRuns: byMetric.get(METRIC_AGENT_RUNS) ?? 0,
    chatQueries: byMetric.get(METRIC_CHAT_QUERIES) ?? 0,
  })
})
