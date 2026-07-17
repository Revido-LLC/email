/**
 * Connected mailbox accounts.
 *
 * Reads: the account list (nav-rail sync footer, settings) and a single account
 * (404 if absent). OAuth tokens are never serialized — the mapper exposes only
 * display + sync fields. `DELETE /accounts/:id` disconnects one mailbox, cascading
 * its threads/messages/sync state.
 */
import { withUser } from '@revido/db/client'
import { accounts } from '@revido/db/schema'
import { asc, eq } from 'drizzle-orm'
import { notFound } from '../lib/http'
import { mapAccount } from '../lib/mappers'
import { protectedRouter } from '../lib/protected'

export const accountsRouter = protectedRouter()

/** GET /accounts — connected mailboxes. */
accountsRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const list = await withUser(userId, async (tx) => {
    const rows = await tx.select().from(accounts).orderBy(asc(accounts.createdAt))
    return rows.map(mapAccount)
  })
  return c.json(list)
})

/** GET /accounts/:id — one mailbox (404 if absent). */
accountsRouter.get('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const account = await withUser(userId, async (tx) => {
    const row = (await tx.select().from(accounts).where(eq(accounts.id, id)).limit(1)).at(0)
    return row ? mapAccount(row) : undefined
  })
  if (!account) return notFound(c)
  return c.json(account)
})

/** DELETE /accounts/:id — disconnect a mailbox (cascades its content). */
accountsRouter.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const deleted = await withUser(userId, async (tx) => {
    const rows = await tx.delete(accounts).where(eq(accounts.id, id)).returning({ id: accounts.id })
    return rows.length > 0
  })
  if (!deleted) return notFound(c)
  return c.json({ purged: true })
})
