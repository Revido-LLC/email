/**
 * `GET /me` — the current user as a `Contact`.
 *
 * Pervasive in the UI (sender-exclusion, settings, onboarding prefill). Reads the
 * caller's own `users` row under RLS; email/name/avatar are plaintext identity
 * metadata, so no decryption is needed.
 */
import { withUser } from '@revido/db/client'
import { users } from '@revido/db/schema'
import type { Contact } from '@revido/db'
import { eq } from 'drizzle-orm'
import { notFound } from '../lib/http'
import { protectedRouter } from '../lib/protected'

export const meRouter = protectedRouter()

/** GET /me — the signed-in user. */
meRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const me = await withUser(userId, async (tx) => {
    const row = (
      await tx
        .select({ email: users.email, name: users.name, avatarUrl: users.avatarUrl })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    ).at(0)
    if (!row) return undefined
    const contact: Contact = { name: row.name ?? '', email: row.email }
    if (row.avatarUrl) contact.avatarUrl = row.avatarUrl
    return contact
  })
  if (!me) return notFound(c)
  return c.json(me)
})
