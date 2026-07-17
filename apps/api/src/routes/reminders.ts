/**
 * Reminders — follow-up nudges and deadlines.
 *
 * `GET /reminders` lists them (decrypting the context/draft). `POST
 * /reminders/:id/send-chaser` enqueues a `chaser` job for the worker to draft +
 * send the nudge. `POST /reminders/:id/snooze` pushes the due date out.
 */
import { withUser } from '@revido/db/client'
import { reminders } from '@revido/db/schema'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getUserCrypto } from '../lib/crypto'
import { notFound, readJson } from '../lib/http'
import { enqueueJob, JobQueue } from '../lib/jobs'
import { mapReminder } from '../lib/mappers'
import { protectedRouter } from '../lib/protected'

const snoozeSchema = z.object({ until: z.string().datetime() })

export const remindersRouter = protectedRouter()

/** GET /reminders — upcoming reminders, soonest first. */
remindersRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const crypto = await getUserCrypto(userId)
  const list = await withUser(userId, async (tx) => {
    const rows = await tx.select().from(reminders).orderBy(asc(reminders.dueAt))
    return rows.map((row) => mapReminder(crypto, row))
  })
  return c.json(list)
})

/** POST /reminders/:id/send-chaser — enqueue a follow-up nudge. */
remindersRouter.post('/:id/send-chaser', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const exists = await withUser(userId, async (tx) => {
    const row = (await tx.select({ id: reminders.id }).from(reminders).where(eq(reminders.id, id)).limit(1)).at(0)
    return Boolean(row)
  })
  if (!exists) return notFound(c)
  await enqueueJob(JobQueue.chaser, { userId, reminderId: id })
  return c.json({ sent: true })
})

/** POST /reminders/:id/snooze — push the due date out. */
remindersRouter.post('/:id/snooze', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const { until } = await readJson(c, snoozeSchema)
  const crypto = await getUserCrypto(userId)
  const reminder = await withUser(userId, async (tx) => {
    const updated = (
      await tx
        .update(reminders)
        .set({ dueAt: new Date(until), kind: 'snoozed' })
        .where(eq(reminders.id, id))
        .returning()
    ).at(0)
    return updated ? mapReminder(crypto, updated) : undefined
  })
  if (!reminder) return notFound(c)
  return c.json(reminder)
})
