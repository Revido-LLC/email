/**
 * `GET /today` — the Today brief on the home screen.
 *
 * There is no stored digest table, so the brief is composed on the fly from the
 * user's live data: counts + the ids the UI resolves (needs-you threads,
 * commitments, recent agent runs), plus a "can ignore" digest of the low-signal
 * categories. Mirrors the mock `TODAY_BRIEF` shape (its `needsYou`/`commitments`/
 * `agentReport` arrays are ids the frontend hydrates). A worker-precomputed digest
 * can replace this later behind the same shape.
 */
import { withUser } from '@revido/db/client'
import { agentRuns, commitments, threads, users } from '@revido/db/schema'
import type { CategoryId, DigestBundle, TodayBrief } from '@revido/db'
import { count, desc, eq, gte, or } from 'drizzle-orm'
import { REVIDO_CTA } from '../lib/catalog'
import { getUserCrypto } from '../lib/crypto'
import { protectedRouter } from '../lib/protected'

export const todayRouter = protectedRouter()

const IGNORE_CATEGORIES: CategoryId[] = ['newsletters', 'promotions', 'notifications']

function greeting(name: string, now: Date): string {
  const hour = now.getHours()
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  const who = name ? `, ${name.split(' ')[0]}` : ''
  return `Good ${part}${who}`
}

/** GET /today — the composed brief. */
todayRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const crypto = await getUserCrypto(userId)
  const now = new Date()

  const brief = await withUser(userId, async (tx): Promise<TodayBrief> => {
    const userRow = (
      await tx.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1)
    ).at(0)

    const needsYouRows = await tx
      .select({ id: threads.id })
      .from(threads)
      .where(or(eq(threads.category, 'to-reply'), gte(threads.priorityScore, 70)))
      .orderBy(desc(threads.priorityScore))
      .limit(6)

    const commitmentRows = await tx
      .select({ id: commitments.id })
      .from(commitments)
      .orderBy(commitments.dueAt)
      .limit(3)

    const runRows = await tx
      .select({ id: agentRuns.id })
      .from(agentRuns)
      .orderBy(desc(agentRuns.at))
      .limit(3)

    const agentsHandled = (await tx.select({ n: count() }).from(agentRuns)).at(0)?.n ?? 0
    const promises = (await tx.select({ n: count() }).from(commitments)).at(0)?.n ?? 0

    // "Can ignore" digest: low-signal categories, up to 3 sample subjects each.
    const canIgnore: DigestBundle[] = []
    for (const category of IGNORE_CATEGORIES) {
      const rows = await tx
        .select({ subjectCt: threads.subjectCt })
        .from(threads)
        .where(eq(threads.category, category))
        .limit(3)
      const total = (
        await tx.select({ n: count() }).from(threads).where(eq(threads.category, category))
      ).at(0)?.n ?? 0
      if (total === 0) continue
      canIgnore.push({
        category,
        count: total,
        items: rows.map((r) => ({ subject: crypto.decrypt(r.subjectCt), sender: '' })),
      })
    }

    const name = userRow?.name ?? ''
    return {
      greeting: greeting(name, now),
      date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
      stats: { needYou: needsYouRows.length, promises, agentsHandled },
      needsYou: needsYouRows.map((r) => r.id),
      commitments: commitmentRows.map((r) => r.id),
      agentReport: runRows.map((r) => r.id),
      canIgnore,
      revidoCta: REVIDO_CTA,
    }
  })

  return c.json(brief)
})
