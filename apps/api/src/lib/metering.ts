/**
 * AI usage metering — best-effort per-call increments of `usage_counters`.
 *
 * Every billable AI request bumps a `usage_counters` row for the current month
 * (the same table + upsert pattern `routes/settings.ts` uses, RLS-scoped via
 * `withUser`). The `GET /usage` route reads `ai_drafts` / `chat_queries` back
 * for the Settings › Usage tab. Metering never blocks or fails a response: any
 * DB error is swallowed and logged, so a metering hiccup can't break a draft or
 * chat stream.
 */
import { withUser } from '@revido/db/client'
import { usageCounters } from '@revido/db/schema'
import { sql } from 'drizzle-orm'

/** Metric names the metering path writes (mirrors what `GET /usage` reads back). */
export const UsageMetric = {
  aiDrafts: 'ai_drafts',
  chatQueries: 'chat_queries',
  agentCompiles: 'ai_compiles',
} as const

export type UsageMetricName = (typeof UsageMetric)[keyof typeof UsageMetric]

/** ISO month bucket, e.g. "2026-07". */
function currentPeriod(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7)
}

/**
 * Increment a metering counter for the current month. Best-effort: swallows and
 * logs any error so it never propagates into the request/stream path.
 */
export async function recordAiUsage(
  userId: string,
  metric: UsageMetricName,
  delta = 1,
): Promise<void> {
  const period = currentPeriod()
  try {
    await withUser(userId, async (tx) => {
      await tx
        .insert(usageCounters)
        .values({ userId, metric, period, count: delta })
        .onConflictDoUpdate({
          target: [usageCounters.userId, usageCounters.metric, usageCounters.period],
          set: { count: sql`${usageCounters.count} + ${delta}` },
        })
    })
  } catch (err) {
    console.error('[api] usage metering failed', { metric, err })
  }
}
