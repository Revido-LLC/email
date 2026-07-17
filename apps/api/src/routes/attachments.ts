/**
 * `POST /attachments` — the composer's upload drop-target.
 *
 * Accepts a `multipart/form-data` upload and returns an `Attachment` DTO (id +
 * display metadata) the composer references until send. Object storage and the
 * `attachments` row (which is keyed to a `messageId` that does not exist until
 * send) land in Wave 5; today this derives the display metadata and hands back an
 * id, so the compose UX works end-to-end without persisting bytes.
 */
import { randomUUID } from 'node:crypto'
import type { Attachment } from '@revido/db'
import { HttpError } from '../lib/http'
import { protectedRouter } from '../lib/protected'

export const attachmentsRouter = protectedRouter()

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

/** POST /attachments — accept an upload, return its display metadata. */
attachmentsRouter.post('/', async (c) => {
  const body = await c.req.parseBody()
  const file = body['file']
  if (!(file instanceof File)) {
    throw new HttpError(400, 'no_file', 'Expected a `file` field in the multipart body.')
  }
  const attachment: Attachment = {
    id: randomUUID(),
    name: file.name || 'attachment',
    size: humanSize(file.size),
    mime: file.type || 'application/octet-stream',
    kind: attachmentKind(file.type, file.name),
  }
  return c.json(attachment, 201)
})
