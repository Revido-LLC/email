/**
 * AI preferences — the four per-feature toggles on the Settings › AI tab.
 *
 * The schema has no dedicated preferences column, so these persist as 0/1
 * `usage_counters` rows under a reserved `ai-prefs` period (user-scoped RLS). This
 * is a deliberate stopgap: when a real `settings` jsonb column lands on `users`,
 * only this file changes. Defaults are all-on, so a fresh user reads `true` for
 * each toggle.
 */
import { withUser } from '@revido/db/client'
import { usageCounters } from '@revido/db/schema'
import type { DbTransaction } from '@revido/db/client'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { readJson } from '../lib/http'
import { protectedRouter } from '../lib/protected'

const PREFS_PERIOD = 'ai-prefs'
const PREF_KEYS = ['drafts', 'agents', 'chat', 'digest'] as const
type PrefKey = (typeof PREF_KEYS)[number]

const metricFor = (key: PrefKey): string => `pref_${key}`

const updateAiSchema = z.object({
  drafts: z.boolean().optional(),
  agents: z.boolean().optional(),
  chat: z.boolean().optional(),
  digest: z.boolean().optional(),
})

type AiPreferences = Record<PrefKey, boolean>

export const settingsRouter = protectedRouter()

/** Read the persisted prefs, defaulting each toggle to on. */
async function readPrefs(tx: DbTransaction, userId: string): Promise<AiPreferences> {
  const rows = await tx
    .select({ metric: usageCounters.metric, count: usageCounters.count })
    .from(usageCounters)
    .where(and(eq(usageCounters.userId, userId), eq(usageCounters.period, PREFS_PERIOD)))
  const byMetric = new Map(rows.map((r) => [r.metric, r.count]))
  const prefs = {} as AiPreferences
  for (const key of PREF_KEYS) {
    const stored = byMetric.get(metricFor(key))
    prefs[key] = stored === undefined ? true : stored !== 0
  }
  return prefs
}

/** GET /settings/ai — the current toggle state. */
settingsRouter.get('/ai', async (c) => {
  const userId = c.get('userId')
  const prefs = await withUser(userId, (tx) => readPrefs(tx, userId))
  return c.json(prefs)
})

/** PATCH /settings/ai — update a subset of toggles; returns the merged state. */
settingsRouter.patch('/ai', async (c) => {
  const userId = c.get('userId')
  const body = await readJson(c, updateAiSchema)
  const prefs = await withUser(userId, async (tx) => {
    for (const key of PREF_KEYS) {
      const value = body[key]
      if (value === undefined) continue
      await tx
        .insert(usageCounters)
        .values({ userId, metric: metricFor(key), period: PREFS_PERIOD, count: value ? 1 : 0 })
        .onConflictDoUpdate({
          target: [usageCounters.userId, usageCounters.metric, usageCounters.period],
          set: { count: value ? 1 : 0 },
        })
    }
    return readPrefs(tx, userId)
  })
  return c.json(prefs)
})
