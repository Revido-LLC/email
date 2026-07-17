/**
 * Category-scoped reads: the per-category thread list, an unread count, and the
 * all-category counts map that badges the nav rail.
 *
 * The 9 categories themselves are static product taxonomy shipped as a frontend
 * constant (see `@revido/db` `CategoryId`), not an endpoint — these routes only
 * serve the per-user counts and lists derived from `threads.category`.
 */
import { withUser } from '@revido/db/client'
import { threads } from '@revido/db/schema'
import { categorySchema } from '@revido/db/zod'
import type { CategoryId } from '@revido/db'
import { and, count, desc, eq } from 'drizzle-orm'
import { getUserCrypto } from '../lib/crypto'
import { HttpError } from '../lib/http'
import { assembleThreads } from '../lib/mappers'
import { protectedRouter } from '../lib/protected'

export const categoriesRouter = protectedRouter()

function parseCategory(raw: string): CategoryId {
  const parsed = categorySchema.safeParse(raw)
  if (!parsed.success) throw new HttpError(400, 'invalid_category')
  return parsed.data
}

/** GET /categories/counts — total threads per category. */
categoriesRouter.get('/counts', async (c) => {
  const userId = c.get('userId')
  const counts = await withUser(userId, async (tx) => {
    return tx
      .select({ category: threads.category, n: count() })
      .from(threads)
      .groupBy(threads.category)
  })
  const result = {} as Record<CategoryId, number>
  for (const row of counts) result[row.category] = row.n
  return c.json(result)
})

/** GET /categories/:categoryId/unread-count — unread threads in a category. */
categoriesRouter.get('/:categoryId/unread-count', async (c) => {
  const userId = c.get('userId')
  const category = parseCategory(c.req.param('categoryId'))
  const n = await withUser(userId, async (tx) => {
    const rows = await tx
      .select({ n: count() })
      .from(threads)
      .where(and(eq(threads.category, category), eq(threads.unread, true)))
    return rows.at(0)?.n ?? 0
  })
  return c.json(n)
})

/** GET /categories/:categoryId/threads — threads in a category, by priority. */
categoriesRouter.get('/:categoryId/threads', async (c) => {
  const userId = c.get('userId')
  const category = parseCategory(c.req.param('categoryId'))
  const crypto = await getUserCrypto(userId)
  const list = await withUser(userId, async (tx) => {
    const rows = await tx
      .select()
      .from(threads)
      .where(eq(threads.category, category))
      .orderBy(desc(threads.priorityScore))
    return assembleThreads(tx, crypto, rows)
  })
  return c.json(list)
})
