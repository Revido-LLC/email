/**
 * `POST /account/delete-everything` — the account-closure / crypto-shred path.
 *
 * In one service transaction: append a `key.purge` audit row (append-only,
 * survives the delete), hard-delete the user's embedding/derived rows, run the
 * `purgeUserKey` statement to delete the wrapped DEK — after which every `*Ct`
 * column is cryptographically unrecoverable — then delete the `users` row, which
 * cascades all remaining mailbox content, accounts, and sessions. The schema has
 * no soft-tombstone column, so this is a hard delete plus provable shred.
 *
 * The embedding hard-delete is explicit (not merely relied on via the FK cascade)
 * so the search-derived vectors are provably gone and the purge path is testable.
 */
import { asService } from '@revido/db/client'
import { messageEmbeddings, users } from '@revido/db/schema'
import { purgeUserKey } from '@revido/db/crypto'
import { eq, sql } from 'drizzle-orm'
import { appendAuditLog } from '../lib/audit'
import { protectedRouter } from '../lib/protected'

export const accountMgmtRouter = protectedRouter()

/** POST /account/delete-everything — purge the key and delete the account. */
accountMgmtRouter.post('/delete-everything', async (c) => {
  const userId = c.get('userId')
  await asService(async (tx) => {
    await appendAuditLog(
      {
        userId,
        actor: 'user',
        action: 'key.purge',
        resourceType: 'user',
        resourceId: userId,
        metadata: { reason: 'account.delete-everything' },
      },
      tx,
    )
    // Hard-delete search-derived vectors for the user (belt-and-suspenders with
    // the FK cascade, and proves the FTS/embedding rows are gone).
    await tx.delete(messageEmbeddings).where(eq(messageEmbeddings.userId, userId))
    // Crypto-shred: delete the user's wrapped DEK (the purgeUserKey statement).
    const purge = purgeUserKey(userId)
    await tx.execute(sql`delete from user_keys where user_id = ${purge.params[0]}`)
    // Hard delete the identity; FK cascades remove all content + accounts + sessions.
    await tx.delete(users).where(eq(users.id, userId))
  })
  return c.json({ deleted: true })
})
