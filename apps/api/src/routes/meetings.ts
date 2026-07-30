import { createHash } from 'node:crypto'
import { withUser } from '@revido/db/client'
import {
  meetingSummaries,
  meetings,
  recordingChunks,
  transcriptSegments,
} from '@revido/db/schema'
import { createStorageProvider } from '@revido/core'
import { and, asc, desc, eq, lt } from 'drizzle-orm'
import { z } from 'zod'
import { getUserCrypto } from '../lib/crypto'
import { HttpError, notFound, readJson } from '../lib/http'
import { enqueueJob, JobQueue } from '../lib/jobs'
import { protectedRouter } from '../lib/protected'

const createSessionInput = z.object({
  title: z.string().trim().min(1).max(200),
  source: z.enum(['web', 'extension', 'microphone']).default('web'),
  meetingProvider: z.enum(['google-meet', 'zoom', 'teams', 'in-person', 'other']).optional(),
  recordingMode: z.enum(['tab-and-mic', 'tab', 'mic']).default('tab-and-mic'),
  calendarEventId: z.string().uuid().optional(),
  consentAcknowledged: z.literal(true),
})
const completeInput = z.object({
  durationMs: z.number().int().positive().max(24 * 60 * 60 * 1000),
  finalSequence: z.number().int().nonnegative(),
})
const MAX_CHUNK_BYTES = 8 * 1024 * 1024

export const meetingsRouter = protectedRouter()
export const recordingsRouter = protectedRouter()

recordingsRouter.post('/sessions', async (c) => {
  const userId = c.get('userId')
  const input = await readJson(c, createSessionInput)
  const crypto = await getUserCrypto(userId)
  const meeting = await withUser(userId, async (tx) =>
    (
      await tx
        .insert(meetings)
        .values({
          userId,
          titleCt: crypto.encrypt(input.title),
          source: input.source ?? 'web',
          meetingProvider: input.meetingProvider,
          recordingMode: input.recordingMode ?? 'tab-and-mic',
          calendarEventId: input.calendarEventId,
          status: 'recording',
          startedAt: new Date(),
          consentAcknowledgedAt: new Date(),
        })
        .returning({ id: meetings.id, status: meetings.status })
    )[0],
  )
  if (!meeting) throw new HttpError(500, 'recording_create_failed')
  return c.json(meeting, 201)
})

recordingsRouter.post('/:id/chunks', async (c) => {
  const userId = c.get('userId')
  const sequence = Number(c.req.query('sequence'))
  if (!Number.isInteger(sequence) || sequence < 0) throw new HttpError(400, 'invalid_sequence')
  const declaredSize = Number(c.req.header('content-length') ?? 0)
  if (declaredSize > MAX_CHUNK_BYTES) throw new HttpError(413, 'chunk_too_large')
  const contentType = c.req.header('content-type') ?? 'application/octet-stream'
  const bytes = new Uint8Array(await c.req.arrayBuffer())
  if (!bytes.byteLength) throw new HttpError(400, 'empty_chunk')
  if (bytes.byteLength > MAX_CHUNK_BYTES) throw new HttpError(413, 'chunk_too_large')
  const crypto = await getUserCrypto(userId)
  const checksum = createHash('sha256').update(bytes).digest('hex')
  const meetingId = c.req.param('id')
  const exists = await withUser(userId, async (tx) =>
    Boolean(
      (
        await tx
          .select({ id: meetings.id })
          .from(meetings)
          .where(and(eq(meetings.id, meetingId), eq(meetings.status, 'recording')))
          .limit(1)
      )[0],
    ),
  )
  if (!exists) return notFound(c, 'recording_not_found')

  const storage = createStorageProvider()
  // Railway services do not share a filesystem. When S3/R2 is not configured,
  // keep the chunk encrypted in Postgres via the existing ciphertext column.
  const ref = process.env.STORAGE_S3_BUCKET
    ? (
        await storage.put(`recordings/${userId}/${meetingId}/${sequence}`, bytes, {
          contentType,
        })
      ).ref
    : `inline:${Buffer.from(bytes).toString('base64')}`
  try {
    const row = await withUser(userId, async (tx) =>
      (
        await tx
          .insert(recordingChunks)
          .values({
            userId,
            meetingId,
            sequence,
            sizeBytes: bytes.byteLength,
            checksum,
            storageRefCt: crypto.encrypt(ref),
          })
          .onConflictDoUpdate({
            target: [recordingChunks.meetingId, recordingChunks.sequence],
            set: {
              sizeBytes: bytes.byteLength,
              checksum,
              storageRefCt: crypto.encrypt(ref),
            },
          })
          .returning({ id: recordingChunks.id })
      )[0],
    )
    return c.json({ id: row?.id, sequence, checksum })
  } catch (error) {
    if (!ref.startsWith('inline:')) await storage.delete(ref).catch(() => undefined)
    throw error
  }
})

recordingsRouter.post('/:id/complete', async (c) => {
  const userId = c.get('userId')
  const input = await readJson(c, completeInput)
  const meetingId = c.req.param('id')
  await withUser(userId, async (tx) => {
    const chunks = await tx
      .select({ sequence: recordingChunks.sequence })
      .from(recordingChunks)
      .where(eq(recordingChunks.meetingId, meetingId))
      .orderBy(asc(recordingChunks.sequence))
    if (
      chunks.length !== input.finalSequence + 1 ||
      chunks.some((chunk, index) => chunk.sequence !== index)
    ) {
      throw new HttpError(409, 'recording_chunks_incomplete')
    }
    const total = await tx
      .select({ sizeBytes: recordingChunks.sizeBytes })
      .from(recordingChunks)
      .where(eq(recordingChunks.meetingId, meetingId))
    if (total.reduce((sum, chunk) => sum + chunk.sizeBytes, 0) > 250 * 1024 * 1024) {
      throw new HttpError(413, 'recording_too_large')
    }
    const updated = (
      await tx
        .update(meetings)
        .set({
          status: 'queued',
          durationMs: input.durationMs,
          endedAt: new Date(),
          rawAudioDeleteAfter: new Date(Date.now() + 24 * 60 * 60 * 1000),
          updatedAt: new Date(),
        })
        .where(and(eq(meetings.id, meetingId), eq(meetings.status, 'recording')))
        .returning({ id: meetings.id })
    )[0]
    if (!updated) throw new HttpError(409, 'recording_not_active')
  })
  const job = await enqueueJob(JobQueue.meetingProcess, { userId, meetingId })
  return c.json({ meetingId, jobId: job.id, status: 'queued' })
})

meetingsRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const crypto = await getUserCrypto(userId)
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 30)))
  const cursorRaw = c.req.query('cursor')
  const cursor = cursorRaw ? new Date(Buffer.from(cursorRaw, 'base64url').toString()) : undefined
  if (cursor && !Number.isFinite(cursor.valueOf())) throw new HttpError(400, 'invalid_cursor')
  const rows = await withUser(userId, (tx) =>
    tx
      .select()
      .from(meetings)
      .where(cursor ? lt(meetings.createdAt, cursor) : undefined)
      .orderBy(desc(meetings.createdAt))
      .limit(limit + 1),
  )
  const page = rows.slice(0, limit)
  return c.json({
    items: page.map((row) => ({
      id: row.id,
      title: crypto.decrypt(row.titleCt),
      status: row.status,
      source: row.source,
      meetingProvider: row.meetingProvider,
      durationMs: row.durationMs,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      createdAt: row.createdAt,
    })),
    nextCursor:
      rows.length > limit && page.at(-1)
        ? Buffer.from(page.at(-1)!.createdAt.toISOString()).toString('base64url')
        : null,
  })
})

meetingsRouter.get('/:id', async (c) => {
  const userId = c.get('userId')
  const crypto = await getUserCrypto(userId)
  const result = await withUser(userId, async (tx) => {
    const meeting = (
      await tx.select().from(meetings).where(eq(meetings.id, c.req.param('id'))).limit(1)
    )[0]
    if (!meeting) return undefined
    const [summary, segments] = await Promise.all([
      tx
        .select()
        .from(meetingSummaries)
        .where(eq(meetingSummaries.meetingId, meeting.id))
        .limit(1)
        .then((rows) => rows[0]),
      tx
        .select()
        .from(transcriptSegments)
        .where(eq(transcriptSegments.meetingId, meeting.id))
        .orderBy(asc(transcriptSegments.sequence)),
    ])
    return {
      id: meeting.id,
      title: crypto.decrypt(meeting.titleCt),
      status: meeting.status,
      language: meeting.language,
      durationMs: meeting.durationMs,
      errorCode: meeting.errorCode,
      summary: summary
        ? {
            summary: crypto.decrypt(summary.summaryCt),
            decisions: JSON.parse(crypto.decrypt(summary.decisionsCt) || '[]'),
            questions: JSON.parse(crypto.decrypt(summary.questionsCt) || '[]'),
            actionItems: JSON.parse(crypto.decrypt(summary.actionItemsCt) || '[]'),
          }
        : null,
      transcript: segments.map((segment) => ({
        sequence: segment.sequence,
        startsAtMs: segment.startsAtMs,
        endsAtMs: segment.endsAtMs,
        speaker: crypto.decrypt(segment.speakerCt),
        text: crypto.decrypt(segment.textCt),
        language: segment.language,
        confidence: segment.confidence,
      })),
    }
  })
  return result ? c.json(result) : notFound(c)
})

meetingsRouter.post('/:id/reprocess', async (c) => {
  const userId = c.get('userId')
  const meetingId = c.req.param('id')
  const updated = await withUser(userId, async (tx) =>
    (
      await tx
        .update(meetings)
        .set({ status: 'queued', errorCode: null, updatedAt: new Date() })
        .where(eq(meetings.id, meetingId))
        .returning({ id: meetings.id })
    )[0],
  )
  if (!updated) return notFound(c)
  const job = await enqueueJob(JobQueue.meetingProcess, { userId, meetingId })
  return c.json({ jobId: job.id, status: 'queued' })
})
