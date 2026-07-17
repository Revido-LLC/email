/**
 * `POST /account/delete-everything` — the account-closure / crypto-shred path.
 *
 * In one service transaction: append a `key.purge` audit row (append-only,
 * survives the delete), run the `purgeUserKey` statement to delete the wrapped DEK
 * — after which every `*Ct` column is cryptographically unrecoverable — then delete
 * the `users` row, which cascades all mailbox content, accounts, and sessions. The
 * schema has no soft-tombstone column, so this is a hard delete plus provable
 * shred.
 */
import { asService } from '@revido/db/client'
import { auditLog, users } from '@revido/db/schema'
import { purgeUserKey } from '@revido/db/crypto'
import { eq, sql } from 'drizzle-orm'
import { protectedRouter } from '../lib/protected'

export const accountMgmtRouter = protectedRouter()

/** POST /account/delete-everything — purge the key and delete the account. */
accountMgmtRouter.post('/delete-everything', async (c) => {
  const userId = c.get('userId')
  await asService(async (tx) => {
    await tx.insert(auditLog).values({
      userId,
      actor: 'user',
      action: 'key.purge',
      resourceType: 'user',
      resourceId: userId,
      metadata: { reason: 'account.delete-everything' },
    })
    // Crypto-shred: delete the user's wrapped DEK (the purgeUserKey statement).
    const purge = purgeUserKey(userId)
    await tx.execute(sql`delete from user_keys where user_id = ${purge.params[0]}`)
    // Hard delete the identity; FK cascades remove all content + accounts + sessions.
    await tx.delete(users).where(eq(users.id, userId))
  })
  return c.json({ deleted: true })
})
