/**
 * Commitments — promises the user made, surfaced from the inbox.
 *
 * `GET /commitments` lists them soonest-due first, decrypting the commitment text
 * and subject.
 */
import { withUser } from '@revido/db/client'
import { commitments } from '@revido/db/schema'
import { asc } from 'drizzle-orm'
import { getUserCrypto } from '../lib/crypto'
import { mapCommitment } from '../lib/mappers'
import { protectedRouter } from '../lib/protected'

export const commitmentsRouter = protectedRouter()

/** GET /commitments — tracked promises, soonest due first. */
commitmentsRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const crypto = await getUserCrypto(userId)
  const list = await withUser(userId, async (tx) => {
    const rows = await tx.select().from(commitments).orderBy(asc(commitments.dueAt))
    return rows.map((row) => mapCommitment(crypto, row))
  })
  return c.json(list)
})
