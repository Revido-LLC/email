/**
 * Account settings endpoints.
 *
 * - AI preferences (Settings › AI): the four per-feature toggles. The schema has
 *   no dedicated preferences column, so these persist as 0/1 `usage_counters` rows
 *   under a reserved `ai-prefs` period (user-scoped RLS). A deliberate stopgap:
 *   when a real `settings` jsonb column lands on `users`, only this file changes.
 *   Defaults are all-on, so a fresh user reads `true` for each toggle.
 * - Appearance (Settings › Appearance): the theme preference, stored on the
 *   `users.theme` column so the choice follows the user across devices. Nullable —
 *   an un-set preference reads as `null` and the client falls back to localStorage.
 */
import { withUser } from '@revido/db/client'
import { usageCounters, users } from '@revido/db/schema'
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

/* ------------------------------------------------------------------ */
/* Appearance — the cross-device theme preference (users.theme).       */
/* ------------------------------------------------------------------ */

const THEME_VALUES = ['light', 'dark', 'system'] as const
type Theme = (typeof THEME_VALUES)[number]

interface Appearance {
  theme: Theme | null
}

const updateAppearanceSchema = z.object({
  theme: z.enum(THEME_VALUES),
})

/** Coerce a stored column value to a known theme, or `null` if unset/unknown. */
function normalizeTheme(value: string | null): Theme | null {
  return value !== null && (THEME_VALUES as readonly string[]).includes(value)
    ? (value as Theme)
    : null
}

/** GET /settings/appearance — the stored theme, or `null` when never set. */
settingsRouter.get('/appearance', async (c) => {
  const userId = c.get('userId')
  const theme = await withUser(userId, async (tx) => {
    const [row] = await tx.select({ theme: users.theme }).from(users).where(eq(users.id, userId))
    return normalizeTheme(row?.theme ?? null)
  })
  return c.json<Appearance>({ theme })
})

/** PATCH /settings/appearance — set the theme (validated enum); echoes it back. */
settingsRouter.patch('/appearance', async (c) => {
  const userId = c.get('userId')
  const body = await readJson(c, updateAppearanceSchema)
  const theme = await withUser(userId, async (tx) => {
    await tx.update(users).set({ theme: body.theme }).where(eq(users.id, userId))
    return body.theme
  })
  return c.json<Appearance>({ theme })
})
