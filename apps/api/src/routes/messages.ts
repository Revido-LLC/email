/**
 * Composer send path.
 *
 * `POST /messages` composes a new message (creating a thread when none is given),
 * persists it encrypted, and enqueues a deferred `send` job (10s undo window).
 * `POST /messages/:id/cancel` is the undo — it removes the still-pending job and
 * the never-sent message. `POST /messages/:id/load-images` clears the blocked-image
 * flag and returns the stored sanitized HTML (the image proxy itself is Wave 5).
 */
import { withUser } from '@revido/db/client'
import { accounts, messages } from '@revido/db/schema'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getUserCrypto } from '../lib/crypto'
import { HttpError, notFound, readJson } from '../lib/http'
import { protectedRouter } from '../lib/protected'
import { cancelSend, sendCompose, type RecipientInput } from '../lib/send'

const recipientSchema = z.union([
  z.string().email(),
  z.object({ email: z.string().email(), name: z.string().optional() }),
])

const composeSchema = z.object({
  threadId: z.string().optional(),
  accountId: z.string().optional(),
  to: z.array(recipientSchema).min(1),
  cc: z.array(recipientSchema).optional(),
  subject: z.string().default(''),
  html: z.string(),
  attachmentIds: z.array(z.string()).optional(),
  remindIfNoReply: z.boolean().optional(),
})

/** Normalize a string|object recipient to `{ email, name? }`. */
function normalize(r: z.infer<typeof recipientSchema>): RecipientInput {
  return typeof r === 'string' ? { email: r } : r
}

export const messagesRouter = protectedRouter()

/** POST /messages — compose + enqueue a deferred send. */
messagesRouter.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await readJson(c, composeSchema)
  const crypto = await getUserCrypto(userId)

  // Resolve the sending account: explicit, else the user's first-connected one.
  const accountId =
    body.accountId ??
    (await withUser(userId, async (tx) => {
      const row = (
        await tx.select({ id: accounts.id }).from(accounts).orderBy(asc(accounts.createdAt)).limit(1)
      ).at(0)
      return row?.id
    }))
  if (!accountId) throw new HttpError(400, 'no_account', 'No mailbox is connected to send from.')

  const message = await sendCompose(userId, crypto, {
    threadId: body.threadId,
    accountId,
    to: body.to.map(normalize),
    cc: body.cc?.map(normalize),
    subject: body.subject ?? '',
    html: body.html,
  })
  return c.json(message, 201)
})

/** POST /messages/:id/cancel — the 10s undo. */
messagesRouter.post('/:id/cancel', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  await cancelSend(userId, id)
  return c.json({ cancelled: true })
})

/** POST /messages/:id/load-images — reveal blocked remote images. */
messagesRouter.post('/:id/load-images', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const crypto = await getUserCrypto(userId)
  const html = await withUser(userId, async (tx) => {
    const row = (
      await tx.select({ htmlCt: messages.htmlCt }).from(messages).where(eq(messages.id, id)).limit(1)
    ).at(0)
    if (!row) return undefined
    await tx.update(messages).set({ imagesBlocked: false }).where(eq(messages.id, id))
    return crypto.decrypt(row.htmlCt)
  })
  if (html === undefined) return notFound(c)
  return c.json({ html })
})
