import type { StorageProvider } from '@revido/core'
import type { JsonValue, WorkerDb } from '../db/client'
import type { UserContext } from '../db/accounts'
import type { JobConsumer } from '../queue/runner'
import { meetingProcessPayload } from '../queue/jobs'

interface TranscriptSegment {
  startMs: number
  endMs: number
  speaker?: string
  text: string
  language?: string
  confidence?: number
}

interface TranscriptionResult {
  language?: string
  segments: TranscriptSegment[]
}

export interface MeetingProcessDeps {
  db: WorkerDb
  storage: StorageProvider
  loadUser(userId: string): Promise<UserContext>
  transcribe(bytes: Uint8Array): Promise<TranscriptionResult>
}

/** Provider-neutral transcription endpoint for EU/ZDR deployments. */
export function createTranscriber(env: NodeJS.ProcessEnv = process.env) {
  return async (bytes: Uint8Array): Promise<TranscriptionResult> => {
    const url =
      env.TRANSCRIPTION_API_URL ?? 'https://openrouter.ai/api/v1/audio/transcriptions'
    const apiKey = env.TRANSCRIPTION_API_KEY ?? env.OPENROUTER_API_KEY
    if (!apiKey) throw new Error('No transcription API key is configured')
    if (!env.TRANSCRIPTION_API_URL) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: env.TRANSCRIPTION_MODEL ?? 'openai/whisper-large-v3',
          input_audio: {
            data: Buffer.from(bytes).toString('base64'),
            format: 'webm',
          },
          ...(env.OPENROUTER_ENFORCE_ZDR !== 'false'
            ? { provider: { zdr: true, data_collection: 'deny' } }
            : {}),
        }),
      })
      if (!response.ok) throw new Error(`transcription failed (${response.status})`)
      const result = (await response.json()) as { text?: string }
      if (!result.text?.trim()) throw new Error('transcription response has no text')
      return {
        segments: [
          {
            startMs: 0,
            endMs: 0,
            speaker: 'Speaker',
            text: result.text.trim(),
          },
        ],
      }
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'audio/webm',
        authorization: `Bearer ${apiKey}`,
      },
      body: Buffer.from(bytes),
    })
    if (!response.ok) throw new Error(`transcription failed (${response.status})`)
    const result = (await response.json()) as TranscriptionResult
    if (!Array.isArray(result.segments) || result.segments.some((item) => !item.text)) {
      throw new Error('transcription response has no valid segments')
    }
    return result
  }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0))
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

export function makeMeetingProcessConsumer(deps: MeetingProcessDeps): JobConsumer {
  return async (payload) => {
    const { userId, meetingId } = meetingProcessPayload.parse(payload)
    const user = await deps.loadUser(userId)
    const rows = await deps.db.withUser(userId, (sql) => sql<
      { storage_ref_ct: Parameters<UserContext['crypto']['decrypt']>[0] }[]
    >`
      select storage_ref_ct
      from recording_chunks
      where meeting_id = ${meetingId}
      order by sequence asc
    `)
    if (!rows.length) throw new Error(`meeting ${meetingId} has no recording chunks`)
    const refs = rows.map((row) => user.crypto.decrypt(row.storage_ref_ct))

    await deps.db.withUser(userId, (sql) => sql`
      update meetings set status = 'processing', updated_at = now()
      where id = ${meetingId}
    `)

    try {
      const audio = concat(
        await Promise.all(
          refs.map((ref) =>
            ref.startsWith('inline:')
              ? Uint8Array.from(Buffer.from(ref.slice('inline:'.length), 'base64'))
              : deps.storage.get(ref),
          ),
        ),
      )
      const transcript = await deps.transcribe(audio)
      await deps.db.withUser(userId, async (sql) => {
        await sql`delete from transcript_segments where meeting_id = ${meetingId}`
        for (const [sequence, segment] of transcript.segments.entries()) {
          await sql`
            insert into transcript_segments (
              user_id, meeting_id, sequence, starts_at_ms, ends_at_ms,
              speaker_ct, text_ct, language, confidence
            ) values (
              ${userId}, ${meetingId}, ${sequence}, ${Math.max(0, segment.startMs)},
              ${Math.max(segment.startMs, segment.endMs)},
              ${sql.json(user.crypto.encrypt(segment.speaker ?? 'Speaker') as unknown as JsonValue)},
              ${sql.json(user.crypto.encrypt(segment.text) as unknown as JsonValue)},
              ${segment.language ?? transcript.language ?? null},
              ${segment.confidence ?? null}
            )
          `
        }
        await sql`
          update meetings
          set status = 'ready',
              language = ${transcript.language ?? null},
              raw_audio_delete_after = null,
              error_code = null,
              updated_at = now()
          where id = ${meetingId}
        `
      })
      await Promise.all(
        refs.filter((ref) => !ref.startsWith('inline:')).map((ref) => deps.storage.delete(ref)),
      )
      await deps.db.withUser(userId, (sql) => sql`
        delete from recording_chunks where meeting_id = ${meetingId}
      `)
    } catch (error) {
      await deps.db.withUser(userId, (sql) => sql`
        update meetings
        set status = 'failed',
            error_code = 'transcription_failed',
            updated_at = now()
        where id = ${meetingId}
      `)
      throw error
    }
  }
}
