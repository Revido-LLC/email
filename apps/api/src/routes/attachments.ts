/**
 * `POST /attachments` — the composer's upload drop-target.
 *
 * Accepts a `multipart/form-data` upload, persists it as a PENDING attachment
 * (no `message_id` yet — the message doesn't exist until send), and returns an
 * `Attachment` DTO (real row id + display metadata) the composer references until
 * send. The bytes are encrypted under the caller's DEK into `content_ct` (inline
 * storage): base64 the raw bytes, encrypt that string, store the ciphertext.
 * `storage_ref_ct` stays null — the object-store swap point for large files
 * (below) keeps the same DTO but writes a Storage ref instead of inline bytes.
 *
 * On send, `POST /messages` / `POST /threads/:id/reply` claim these pending rows
 * (set their `message_id`); the worker then decrypts `content_ct` and attaches the
 * bytes to the outbound provider message.
 */
import type { Attachment } from '@revido/db'
import { withUser } from '@revido/db/client'
import { attachments } from '@revido/db/schema'
import { getUserCrypto } from '../lib/crypto'
import { HttpError } from '../lib/http'
import { protectedRouter } from '../lib/protected'

export const attachmentsRouter = protectedRouter()

/**
 * Inline-content cap. Bytes are base64'd then AES-GCM-encrypted and stored in a
 * jsonb column, so this bounds request memory and row size. Above it, the swap is
 * to stream to an object store and persist an encrypted `storage_ref_ct` instead.
 */
const MAX_INLINE_BYTES = 10 * 1024 * 1024 // 10 MB

/** Map a mime type to the coarse display kind the UI badges with. */
function attachmentKind(mime: string, name: string): Attachment['kind'] {
  const lower = `${mime} ${name}`.toLowerCase()
  if (lower.includes('pdf')) return 'pdf'
  if (mime.startsWith('image/')) return 'image'
  if (lower.includes('sheet') || lower.includes('excel') || lower.endsWith('.csv')) return 'sheet'
  if (lower.includes('word') || lower.includes('document') || lower.endsWith('.doc')) return 'doc'
  if (lower.includes('zip') || lower.includes('compressed')) return 'zip'
  return 'other'
}

/** Human-readable byte size, e.g. "2.4 MB". */
function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

/** POST /attachments — accept an upload, persist it encrypted + pending, return its DTO. */
attachmentsRouter.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.parseBody()
  const file = body['file']
  if (!(file instanceof File)) {
    throw new HttpError(400, 'no_file', 'Expected a `file` field in the multipart body.')
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.byteLength > MAX_INLINE_BYTES) {
    throw new HttpError(
      413,
      'attachment_too_large',
      `Attachment exceeds the ${MAX_INLINE_BYTES / (1024 * 1024)} MB limit.`,
    )
  }

  const crypto = await getUserCrypto(userId)
  const name = file.name || 'attachment'
  const mime = file.type || 'application/octet-stream'
  // Encrypt the raw bytes (base64 → utf8 ciphertext) under the user DEK, inline.
  const contentCt = crypto.encrypt(Buffer.from(bytes).toString('base64'))

  const inserted = await withUser(userId, async (tx) => {
    const rows = await tx
      .insert(attachments)
      .values({
        userId,
        messageId: null,
        name,
        size: humanSize(bytes.byteLength),
        sizeBytes: bytes.byteLength,
        mime,
        kind: attachmentKind(mime, name),
        contentCt,
      })
      .returning({ id: attachments.id })
    return rows.at(0)
  })
  if (!inserted) throw new HttpError(500, 'attachment_persist_failed')

  const attachment: Attachment = {
    id: inserted.id,
    name,
    size: humanSize(bytes.byteLength),
    mime,
    kind: attachmentKind(mime, name),
  }
  return c.json(attachment, 201)
})
