/**
 * `POST /attachments` — the composer's upload drop-target.
 *
 * Accepts a `multipart/form-data` upload, persists it as a PENDING attachment
 * (no `message_id` yet — the message doesn't exist until send), and returns an
 * `Attachment` DTO (real row id + display metadata) the composer references until
 * send.
 *
 * Two storage paths, split by size:
 *  - INLINE (≤ {@link MAX_INLINE_BYTES}): base64 the raw bytes, encrypt that under
 *    the caller's DEK into `content_ct`; `storage_ref_ct` stays null.
 *  - OBJECT STORE (> inline cap, ≤ {@link MAX_ATTACHMENT_BYTES}): stream the raw
 *    bytes to the {@link StorageProvider}, then encrypt the returned object ref
 *    under the DEK into `storage_ref_ct`; `content_ct` stays null. The DB never
 *    sees the bytes and the store never sees a plaintext ref.
 *  - Above {@link MAX_ATTACHMENT_BYTES}: rejected with 413 (the absolute cap).
 *
 * On send, `POST /messages` / `POST /threads/:id/reply` claim these pending rows
 * (set their `message_id`); the worker then reassembles each attachment — decrypt
 * `content_ct` for inline ones, or fetch the object for stored ones — and attaches
 * the bytes to the outbound provider message.
 */
import { randomUUID } from 'node:crypto'
import type { Attachment } from '@revido/db'
import { withUser } from '@revido/db/client'
import type { Ciphertext } from '@revido/db/crypto'
import { attachments } from '@revido/db/schema'
import { createStorageProvider, type StorageProvider } from '@revido/core'
import { getUserCrypto } from '../lib/crypto'
import { HttpError } from '../lib/http'
import { protectedRouter, type ProtectedApp } from '../lib/protected'

/**
 * Inline-content cap. At/below this the bytes are base64'd, AES-GCM-encrypted, and
 * stored in the `content_ct` jsonb column, so this bounds request memory and row
 * size. Above it (up to {@link MAX_ATTACHMENT_BYTES}) the upload streams to the
 * object store and only its encrypted ref is persisted.
 */
const MAX_INLINE_BYTES = 10 * 1024 * 1024 // 10 MB

/** Hard cap: uploads above this are refused with 413 regardless of storage path. */
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024 // 25 MB

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

/**
 * Build the `/attachments` router over a {@link StorageProvider}. The provider is
 * injectable so tests can pass a `FakeStorageProvider`; production uses
 * {@link createStorageProvider} (local FS in dev, the S3/R2 swap in prod).
 */
export function createAttachmentsRouter(
  storage: StorageProvider = createStorageProvider(),
): ProtectedApp {
  const router = protectedRouter()

  /** POST /attachments — accept an upload, persist it encrypted + pending, return its DTO. */
  router.post('/', async (c) => {
    const userId = c.get('userId')
    const body = await c.req.parseBody()
    const file = body['file']
    if (!(file instanceof File)) {
      throw new HttpError(400, 'no_file', 'Expected a `file` field in the multipart body.')
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new HttpError(
        413,
        'attachment_too_large',
        `Attachment exceeds the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB limit.`,
      )
    }

    const crypto = await getUserCrypto(userId)
    const name = file.name || 'attachment'
    const mime = file.type || 'application/octet-stream'

    // Large files go to the object store (encrypted ref); small files stay inline.
    let contentCt: Ciphertext | null = null
    let storageRefCt: Ciphertext | null = null
    if (bytes.byteLength > MAX_INLINE_BYTES) {
      const key = `attachments/${userId}/${randomUUID()}`
      const { ref } = await storage.put(key, bytes, { contentType: mime })
      storageRefCt = crypto.encrypt(ref)
    } else {
      contentCt = crypto.encrypt(Buffer.from(bytes).toString('base64'))
    }

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
          storageRefCt,
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

  return router
}

/** The default router registered by `routes/index.ts` (env-selected storage). */
export const attachmentsRouter = createAttachmentsRouter()
