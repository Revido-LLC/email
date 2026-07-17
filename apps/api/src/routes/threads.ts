/**
 * Threads & messages — the inbox surface.
 *
 * Reads (`/`, `/needs-you`, `/:id`, `/:id/messages`) decrypt the encrypted subject/
 * summary/body columns into the domain DTOs; a missing single thread is a 404.
 * Writes mirror the mock's local-state mutations: archive/snooze, batch
 * archive|label|mark-read, the `PATCH /:id` triage fields (star/unread/labels/mute/
 * category/snooze), delete, the per-thread extracted-fact toggle, and the reply
 * composer. Archive and mute have no dedicated column in the schema, so they are
 * modeled as the reserved `archived` / `muted` labels.
 */
import { withUser } from '@revido/db/client'
import { extractedFacts, messages, threads } from '@revido/db/schema'
import { categorySchema } from '@revido/db/zod'
import { and, asc, desc, eq, gte, inArray, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getUserCrypto } from '../lib/crypto'
import { HttpError, notFound, readJson } from '../lib/http'
import { assembleMessages, assembleThread, assembleThreads } from '../lib/mappers'
import { protectedRouter } from '../lib/protected'
import { sendReply } from '../lib/send'

const ARCHIVED_LABEL = 'archived'
const MUTED_LABEL = 'muted'

const snoozeSchema = z.object({ snoozedUntil: z.string().datetime() })
const batchIdsSchema = z.object({ threadIds: z.array(z.string()).min(1) })
const batchLabelSchema = z.object({ threadIds: z.array(z.string()).min(1), label: z.string().min(1) })
const patchThreadSchema = z.object({
  starred: z.boolean().optional(),
  unread: z.boolean().optional(),
  muted: z.boolean().optional(),
  labels: z.array(z.string()).optional(),
  category: categorySchema.optional(),
  snoozedUntil: z.string().datetime().nullable().optional(),
})
const extractedSchema = z.object({ done: z.boolean() })
const replySchema = z.object({ html: z.string() })

export const threadsRouter = protectedRouter()

/** GET /threads?sort=recent — all mail, newest first. */
threadsRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const crypto = await getUserCrypto(userId)
  const list = await withUser(userId, async (tx) => {
    const rows = await tx
      .select()
      .from(threads)
      .where(eq(threads.userId, userId))
      .orderBy(desc(threads.lastMessageAt))
    return assembleThreads(tx, crypto, rows)
  })
  return c.json(list)
})

/** GET /threads/needs-you — the Focused Inbox (to-reply or high score). */
threadsRouter.get('/needs-you', async (c) => {
  const userId = c.get('userId')
  const crypto = await getUserCrypto(userId)
  const list = await withUser(userId, async (tx) => {
    const rows = await tx
      .select()
      .from(threads)
      .where(or(eq(threads.category, 'to-reply'), gte(threads.priorityScore, 70)))
      .orderBy(desc(threads.priorityScore))
    return assembleThreads(tx, crypto, rows)
  })
  return c.json(list)
})

/** GET /threads/:id — a single thread (404 if absent). */
threadsRouter.get('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const crypto = await getUserCrypto(userId)
  const thread = await withUser(userId, async (tx) => {
    const row = (await tx.select().from(threads).where(eq(threads.id, id)).limit(1)).at(0)
    return assembleThread(tx, crypto, row)
  })
  if (!thread) return notFound(c)
  return c.json(thread)
})

/** GET /threads/:id/messages — the thread's messages, oldest first. */
threadsRouter.get('/:id/messages', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const crypto = await getUserCrypto(userId)
  const list = await withUser(userId, async (tx) => {
    const rows = await tx
      .select()
      .from(messages)
      .where(eq(messages.threadId, id))
      .orderBy(asc(messages.date))
    return assembleMessages(tx, crypto, rows)
  })
  return c.json(list)
})

/** POST /threads/:id/archive — mark archived (reserved label). */
threadsRouter.post('/:id/archive', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const crypto = await getUserCrypto(userId)
  const thread = await withUser(userId, async (tx) => {
    const row = (await tx.select().from(threads).where(eq(threads.id, id)).limit(1)).at(0)
    if (!row) return undefined
    const labels = row.labels.includes(ARCHIVED_LABEL)
      ? row.labels
      : [...row.labels, ARCHIVED_LABEL]
    const updated = (
      await tx.update(threads).set({ labels }).where(eq(threads.id, id)).returning()
    ).at(0)
    return assembleThread(tx, crypto, updated)
  })
  if (!thread) return notFound(c)
  return c.json(thread)
})

/** POST /threads/:id/snooze — defer until a timestamp. */
threadsRouter.post('/:id/snooze', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const { snoozedUntil } = await readJson(c, snoozeSchema)
  const crypto = await getUserCrypto(userId)
  const thread = await withUser(userId, async (tx) => {
    const updated = (
      await tx
        .update(threads)
        .set({ snoozedUntil: new Date(snoozedUntil) })
        .where(eq(threads.id, id))
        .returning()
    ).at(0)
    return assembleThread(tx, crypto, updated)
  })
  if (!thread) return notFound(c)
  return c.json(thread)
})

/** POST /threads/batch/archive — bulk archive. */
threadsRouter.post('/batch/archive', async (c) => {
  const userId = c.get('userId')
  const { threadIds } = await readJson(c, batchIdsSchema)
  await withUser(userId, async (tx) => {
    await tx
      .update(threads)
      .set({ labels: sql`array_append(${threads.labels}, ${ARCHIVED_LABEL})` })
      .where(
        and(
          inArray(threads.id, threadIds),
          sql`NOT (${threads.labels} @> ARRAY[${ARCHIVED_LABEL}]::text[])`,
        ),
      )
  })
  return c.json({ archived: threadIds })
})

/** POST /threads/batch/label — bulk add a label. */
threadsRouter.post('/batch/label', async (c) => {
  const userId = c.get('userId')
  const { threadIds, label } = await readJson(c, batchLabelSchema)
  await withUser(userId, async (tx) => {
    await tx
      .update(threads)
      .set({ labels: sql`array_append(${threads.labels}, ${label})` })
      .where(
        and(inArray(threads.id, threadIds), sql`NOT (${threads.labels} @> ARRAY[${label}]::text[])`),
      )
  })
  return c.json({ updated: threadIds })
})

/** POST /threads/batch/mark-read — bulk mark read. */
threadsRouter.post('/batch/mark-read', async (c) => {
  const userId = c.get('userId')
  const { threadIds } = await readJson(c, batchIdsSchema)
  await withUser(userId, async (tx) => {
    await tx.update(threads).set({ unread: false }).where(inArray(threads.id, threadIds))
  })
  return c.json({ updated: threadIds })
})

/** PATCH /threads/:id — triage fields (star/unread/labels/mute/category/snooze). */
threadsRouter.patch('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const body = await readJson(c, patchThreadSchema)
  const crypto = await getUserCrypto(userId)
  const thread = await withUser(userId, async (tx) => {
    const row = (await tx.select().from(threads).where(eq(threads.id, id)).limit(1)).at(0)
    if (!row) return undefined

    const patch: Partial<typeof threads.$inferInsert> = {}
    if (body.starred !== undefined) patch.starred = body.starred
    if (body.unread !== undefined) patch.unread = body.unread
    if (body.category !== undefined) patch.category = body.category
    if (body.snoozedUntil !== undefined) {
      patch.snoozedUntil = body.snoozedUntil ? new Date(body.snoozedUntil) : null
    }

    // Labels: explicit set wins; mute toggles the reserved `muted` label on top.
    let labels = body.labels ?? row.labels
    if (body.muted === true && !labels.includes(MUTED_LABEL)) labels = [...labels, MUTED_LABEL]
    if (body.muted === false) labels = labels.filter((l) => l !== MUTED_LABEL)
    if (body.labels !== undefined || body.muted !== undefined) patch.labels = labels

    const updated = (
      await tx.update(threads).set(patch).where(eq(threads.id, id)).returning()
    ).at(0)
    return assembleThread(tx, crypto, updated)
  })
  if (!thread) return notFound(c)
  return c.json(thread)
})

/** DELETE /threads/:id — remove the thread (cascades messages). */
threadsRouter.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const deleted = await withUser(userId, async (tx) => {
    const rows = await tx.delete(threads).where(eq(threads.id, id)).returning({ id: threads.id })
    return rows.length > 0
  })
  if (!deleted) return notFound(c)
  return c.json({ deleted: true })
})

/** PATCH /threads/:id/extracted/:index — toggle the Nth action-item's done flag. */
threadsRouter.patch('/:id/extracted/:index', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const index = Number(c.req.param('index'))
  if (!Number.isInteger(index) || index < 0) throw new HttpError(400, 'invalid_index')
  const { done } = await readJson(c, extractedSchema)
  const crypto = await getUserCrypto(userId)
  const thread = await withUser(userId, async (tx) => {
    const factIds = await tx
      .select({ id: extractedFacts.id })
      .from(extractedFacts)
      .where(eq(extractedFacts.threadId, id))
      .orderBy(extractedFacts.position)
    const target = factIds.at(index)
    if (!target) return undefined
    await tx.update(extractedFacts).set({ done }).where(eq(extractedFacts.id, target.id))
    const row = (await tx.select().from(threads).where(eq(threads.id, id)).limit(1)).at(0)
    return assembleThread(tx, crypto, row)
  })
  if (!thread) return notFound(c)
  return c.json(thread)
})

/** POST /threads/:id/reply — reply into the thread; enqueues a deferred send. */
threadsRouter.post('/:id/reply', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const { html } = await readJson(c, replySchema)
  const crypto = await getUserCrypto(userId)
  const message = await sendReply(userId, crypto, id, html)
  return c.json(message)
})
