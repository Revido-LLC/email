import { withUser } from '@revido/db/client'
import { customLabels, threadCustomLabels, threads } from '@revido/db/schema'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { getUserCrypto } from '../lib/crypto'
import { HttpError, notFound, readJson } from '../lib/http'
import { protectedRouter } from '../lib/protected'

const labelInput = z.object({
  name: z.string().trim().min(1).max(48),
  description: z.string().trim().max(500).default(''),
  color: z.string().trim().min(1).max(24).default('blue'),
  icon: z.string().trim().min(1).max(32).default('tag'),
  priority: z.number().int().min(0).max(100).default(50),
  enabled: z.boolean().default(true),
})

const labelPatch = labelInput.partial()
const assignmentInput = z.object({
  labelIds: z.array(z.string().uuid()).max(25),
})

export const labelsRouter = protectedRouter()

labelsRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const crypto = await getUserCrypto(userId)
  const rows = await withUser(userId, (tx) =>
    tx.select().from(customLabels).orderBy(asc(customLabels.priority), asc(customLabels.name)),
  )
  return c.json(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: crypto.decrypt(row.descriptionCt),
      color: row.color,
      icon: row.icon,
      priority: row.priority,
      enabled: row.enabled,
    })),
  )
})

labelsRouter.post('/', async (c) => {
  const userId = c.get('userId')
  const input = await readJson(c, labelInput)
  const crypto = await getUserCrypto(userId)
  const row = await withUser(userId, async (tx) =>
    (
      await tx
        .insert(customLabels)
        .values({
          userId,
          name: input.name,
          descriptionCt: crypto.encrypt(input.description ?? ''),
          color: input.color ?? 'blue',
          icon: input.icon ?? 'tag',
          priority: input.priority ?? 50,
          enabled: input.enabled ?? true,
        })
        .returning()
    )[0],
  )
  if (!row) throw new HttpError(500, 'label_create_failed')
  return c.json({ id: row.id, ...input }, 201)
})

labelsRouter.patch('/:id', async (c) => {
  const userId = c.get('userId')
  const input = await readJson(c, labelPatch)
  const crypto = await getUserCrypto(userId)
  const updated = await withUser(userId, async (tx) =>
    (
      await tx
        .update(customLabels)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined
            ? { descriptionCt: crypto.encrypt(input.description) }
            : {}),
          ...(input.color !== undefined ? { color: input.color } : {}),
          ...(input.icon !== undefined ? { icon: input.icon } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
          updatedAt: new Date(),
        })
        .where(eq(customLabels.id, c.req.param('id')))
        .returning({ id: customLabels.id })
    )[0],
  )
  if (!updated) return notFound(c)
  return c.json({ updated: true })
})

labelsRouter.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const deleted = await withUser(userId, async (tx) =>
    (
      await tx
        .delete(customLabels)
        .where(eq(customLabels.id, c.req.param('id')))
        .returning({ id: customLabels.id })
    )[0],
  )
  if (!deleted) return notFound(c)
  return c.body(null, 204)
})

/**
 * Deterministic preview used before enabling a label. AI classification can
 * replace this scorer without changing the API or the correction audit trail.
 */
labelsRouter.get('/:id/preview', async (c) => {
  const userId = c.get('userId')
  const crypto = await getUserCrypto(userId)
  const result = await withUser(userId, async (tx) => {
    const label = (
      await tx.select().from(customLabels).where(eq(customLabels.id, c.req.param('id'))).limit(1)
    )[0]
    if (!label) return undefined
    const candidates = await tx.select().from(threads).orderBy(asc(threads.createdAt)).limit(100)
    const terms = `${label.name} ${crypto.decrypt(label.descriptionCt)}`
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((term) => term.length >= 3)
    return candidates
      .map((thread) => {
        const haystack = `${crypto.decrypt(thread.subjectCt)} ${crypto.decrypt(thread.tldrCt)} ${crypto.decrypt(thread.summaryCt)}`.toLocaleLowerCase()
        const hits = terms.filter((term) => haystack.includes(term)).length
        return {
          threadId: thread.id,
          subject: crypto.decrypt(thread.subjectCt),
          confidence: terms.length === 0 ? 0 : Math.min(1, hits / Math.min(3, terms.length)),
        }
      })
      .filter((item) => item.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 20)
  })
  if (!result) return notFound(c)
  return c.json(result)
})

/** Manual assignment is authoritative and retained as an auditable correction. */
labelsRouter.put('/threads/:threadId', async (c) => {
  const userId = c.get('userId')
  const { labelIds } = await readJson(c, assignmentInput)
  await withUser(userId, async (tx) => {
    const thread = (
      await tx.select({ id: threads.id }).from(threads).where(eq(threads.id, c.req.param('threadId'))).limit(1)
    )[0]
    if (!thread) throw new HttpError(404, 'thread_not_found')
    if (labelIds.length) {
      const owned = await tx
        .select({ id: customLabels.id })
        .from(customLabels)
        .where(inArray(customLabels.id, labelIds))
      if (owned.length !== new Set(labelIds).size) throw new HttpError(400, 'invalid_label')
    }
    await tx.delete(threadCustomLabels).where(eq(threadCustomLabels.threadId, thread.id))
    if (labelIds.length) {
      await tx.insert(threadCustomLabels).values(
        labelIds.map((labelId) => ({
          userId,
          threadId: thread.id,
          labelId,
          confidence: 1,
          correctedByUser: true,
        })),
      )
    }
  })
  return c.json({ labelIds })
})

labelsRouter.get('/threads/:threadId', async (c) => {
  const userId = c.get('userId')
  const rows = await withUser(userId, (tx) =>
    tx
      .select({ id: customLabels.id, name: customLabels.name, color: customLabels.color })
      .from(threadCustomLabels)
      .innerJoin(
        customLabels,
        and(
          eq(customLabels.id, threadCustomLabels.labelId),
          eq(customLabels.userId, userId),
        ),
      )
      .where(eq(threadCustomLabels.threadId, c.req.param('threadId'))),
  )
  return c.json(rows)
})
