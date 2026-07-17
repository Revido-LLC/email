// i18n-todo: extract hardcoded copy in this component to the en/nl catalogs (see apps/web/src/i18n)
import { AlertCircle, FileText, Loader2, Paperclip, UploadCloud, X } from 'lucide-react'
import * as React from 'react'
import { cn } from '@revido/ui'

/** Upload lifecycle of a composer attachment. */
export type AttachmentStatus = 'uploading' | 'ready' | 'error'

/** A file the composer is attaching: local identity + its upload state. */
export interface ComposerAttachment {
  /** Stable client id (the row exists before the server responds). */
  localId: string
  name: string
  size: string
  status: AttachmentStatus
  /** The persisted attachment id, once uploaded — this is what send references. */
  serverId?: string
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 KB'
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

/**
 * Drag-and-drop attachments zone. Dropped/selected files are handed up as real
 * `File` objects (the composer uploads them); chips reflect each file's upload
 * state — spinner while uploading, a document glyph when ready, an alert on error.
 */
export function AttachmentsZone({
  attachments,
  onAddFiles,
  onRemove,
}: {
  attachments: ComposerAttachment[]
  onAddFiles: (files: File[]) => void
  onRemove: (localId: string) => void
}) {
  const [dragging, setDragging] = React.useState(false)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const dropped = Array.from(e.dataTransfer.files)
    if (dropped.length) onAddFiles(dropped)
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'flex items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-3 text-sm transition-colors',
          dragging
            ? 'border-primary bg-primary/5 text-foreground'
            : 'border-border bg-muted/40 text-muted-foreground',
        )}
      >
        <UploadCloud className={cn('size-4 shrink-0', dragging && 'text-primary')} />
        <span>
          Drag files here to attach{' '}
          <span className="text-muted-foreground/60">— or use the paperclip below</span>
        </span>
      </div>

      {attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <span
              key={a.localId}
              className={cn(
                'inline-flex max-w-full items-center gap-2 rounded-xl border bg-card py-1.5 pl-2.5 pr-1.5 text-xs shadow-soft',
                a.status === 'error' ? 'border-destructive/40' : 'border-border',
              )}
            >
              <AttachmentGlyph status={a.status} />
              <span className="min-w-0 truncate font-medium text-foreground">{a.name}</span>
              <span className="shrink-0 text-muted-foreground">
                {a.status === 'error' ? 'Upload failed' : a.status === 'uploading' ? 'Uploading…' : a.size}
              </span>
              <button
                type="button"
                aria-label={`Remove ${a.name}`}
                onClick={() => onRemove(a.localId)}
                className="flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** The leading glyph on an attachment chip, reflecting its upload state. */
function AttachmentGlyph({ status }: { status: AttachmentStatus }) {
  if (status === 'uploading') {
    return <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
  }
  if (status === 'error') {
    return <AlertCircle className="size-3.5 shrink-0 text-destructive" />
  }
  return <FileText className="size-3.5 shrink-0 text-primary" />
}

/** The compact attach button that lives in the bottom bar — opens a file picker. */
export function AttachButton({ onFiles }: { onFiles: (files: File[]) => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null)

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length) onFiles(files)
          // Reset so selecting the same file again re-triggers change.
          e.target.value = ''
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Attach a file"
      >
        <Paperclip className="size-4" />
      </button>
    </>
  )
}
