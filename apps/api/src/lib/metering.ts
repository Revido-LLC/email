/**
 * AI usage metering + per-user abuse caps over `usage_counters`.
 *
 * Every billable AI request bumps a `usage_counters` row for the current month
 * (the same table + upsert pattern `routes/settings.ts` uses, RLS-scoped via
 * `withUser`). The `GET /usage` route reads `ai_drafts` / `chat_queries` back
 * for the Settings › Usage tab. Metering never blocks or fails a response: any
 * DB error is swallowed and logged, so a metering hiccup can't break a draft or
 * chat stream.
 *
 * {@link enforceAiCap} is the abuse guard: before an (expensive) model call, it
 * reads the caller's month-to-date count and throws 429 once a configurable cap
 * is reached — a per-USER budget layered over the per-IP `rateLimit`. Unlike
 * metering, a cap read failing is swallowed (fail-open) so a DB blip never blocks
 * legitimate use.
 */
import { withUser } from '@revido/db/client'
import { usageCounters } from '@revido/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { HttpError } from './http'

/** Metric names the metering path writes (mirrors what `GET /usage` reads back). */
export const UsageMetric = {
  aiDrafts: 'ai_drafts',
  chatQueries: 'chat_queries',
  agentCompiles: 'ai_compiles',
  agentClarifies: 'ai_clarifies',
} as const

export type UsageMetricName = (typeof UsageMetric)[keyof typeof UsageMetric]

/**
 * Env var + fallback for each metric's monthly per-user cap. A value ≤ 0 (or an
 * unparseable one) disables the cap for that metric. Defaults are generous — they
 * bound runaway abuse, not normal use.
 */
const CAP_CONFIG: Record<UsageMetricName, { env: string; fallback: number }> = {
  [UsageMetric.aiDrafts]: { env: 'AI_MONTHLY_CAP_DRAFTS', fallback: 1000 },
  [UsageMetric.chatQueries]: { env: 'AI_MONTHLY_CAP_CHAT', fallback: 1000 },
  [UsageMetric.agentCompiles]: { env: 'AI_MONTHLY_CAP_COMPILES', fallback: 200 },
  [UsageMetric.agentClarifies]: { env: 'AI_MONTHLY_CAP_CLARIFIES', fallback: 300 },
}

/** Resolve the effective cap for a metric (≤ 0 ⇒ uncapped). */
export function aiCap(metric: UsageMetricName, env: NodeJS.ProcessEnv = process.env): number {
  const cfg = CAP_CONFIG[metric]
  const raw = env[cfg.env]
  if (raw === undefined || raw === '') return cfg.fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : cfg.fallback
}

/** ISO month bucket, e.g. "2026-07". */
function currentPeriod(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7)
}

/**
 * Throw a 429 {@link HttpError} when the caller has hit this month's cap for a
 * metric. Reads month-to-date usage under RLS; a read error fails open (logs +
 * allows) so metering trouble never blocks a request.
 */
export async function enforceAiCap(
  userId: string,
  metric: UsageMetricName,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const cap = aiCap(metric, env)
  if (cap <= 0) return
  const period = currentPeriod()
  let used = 0
  try {
    used = await withUser(userId, async (tx) => {
      const row = (
        await tx
          .select({ count: usageCounters.count })
          .from(usageCounters)
          .where(
            and(
              eq(usageCounters.userId, userId),
              eq(usageCounters.metric, metric),
              eq(usageCounters.period, period),
            ),
          )
          .limit(1)
      ).at(0)
      return row?.count ?? 0
    })
  } catch (err) {
    console.error('[api] usage cap check failed', { metric, err })
    return
  }
  if (used >= cap) {
    throw new HttpError(
      429,
      'usage_cap_exceeded',
      `Monthly AI limit reached for ${metric}. It resets at the start of next month.`,
    )
  }
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
