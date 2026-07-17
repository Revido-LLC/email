/**
 * Signatures — per-account sign-off blocks.
 *
 * `GET /signatures` lists them (decrypting the HTML). `PUT /signatures/:id`
 * replaces one signature's HTML (404 if absent).
 */
import { withUser } from '@revido/db/client'
import { signatures } from '@revido/db/schema'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getUserCrypto } from '../lib/crypto'
import { notFound, readJson } from '../lib/http'
import { mapSignature } from '../lib/mappers'
import { protectedRouter } from '../lib/protected'

const saveSignatureSchema = z.object({ html: z.string() })

export const signaturesRouter = protectedRouter()

/** GET /signatures — all signatures. */
signaturesRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const crypto = await getUserCrypto(userId)
  const list = await withUser(userId, async (tx) => {
    const rows = await tx.select().from(signatures).orderBy(asc(signatures.createdAt))
    return rows.map((row) => mapSignature(crypto, row))
  })
  return c.json(list)
})

/** PUT /signatures/:id — replace a signature's HTML. */
signaturesRouter.put('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const { html } = await readJson(c, saveSignatureSchema)
  const crypto = await getUserCrypto(userId)
  const signature = await withUser(userId, async (tx) => {
    const updated = (
      await tx
        .update(signatures)
        .set({ htmlCt: crypto.encrypt(html) })
        .where(eq(signatures.id, id))
        .returning()
    ).at(0)
    return updated ? mapSignature(crypto, updated) : undefined
  })
  if (!signature) return notFound(c)
  return c.json(signature)
})
