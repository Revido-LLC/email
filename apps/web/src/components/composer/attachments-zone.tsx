// i18n-todo: extract hardcoded copy in this component to the en/nl catalogs (see apps/web/src/i18n)
import { FileText, Paperclip, UploadCloud, X } from 'lucide-react'
import * as React from 'react'
import { cn } from '@revido/ui'

export interface MockAttachment {
  id: string
  name: string
  size: string
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 KB'
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

/**
 * Visual-only drag-and-drop attachments zone. Dropped files are read for their
 * name and size only — nothing is uploaded. Chips list the "attached" files.
 */
export function AttachmentsZone({
  attachments,
  onAdd,
  onRemove,
}: {
  attachments: MockAttachment[]
  onAdd: (files: MockAttachment[]) => void
  onRemove: (id: string) => void
}) {
  const [dragging, setDragging] = React.useState(false)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const dropped = Array.from(e.dataTransfer.files)
    if (!dropped.length) return
    onAdd(
      dropped.map((f) => ({
        id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`,
        name: f.name,
        size: formatBytes(f.size),
      })),
    )
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
              key={a.id}
              className="inline-flex max-w-full items-center gap-2 rounded-xl border border-border bg-card py-1.5 pl-2.5 pr-1.5 text-xs shadow-soft"
            >
              <FileText className="size-3.5 shrink-0 text-primary" />
              <span className="min-w-0 truncate font-medium text-foreground">{a.name}</span>
              <span className="shrink-0 text-muted-foreground">{a.size}</span>
              <button
                type="button"
                aria-label={`Remove ${a.name}`}
                onClick={() => onRemove(a.id)}
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

/** The compact attach button that lives in the bottom bar. */
export function AttachButton({ onAttach }: { onAttach: (file: MockAttachment) => void }) {
  const samples = [
    { name: 'Brightfoundry-overview.pdf', size: '2.3 MB' },
    { name: 'Q3-proposal-v3.pdf', size: '840 KB' },
    { name: 'scope-and-timeline.pdf', size: '312 KB' },
  ]
  const nextRef = React.useRef(0)

  return (
    <button
      type="button"
      onClick={() => {
        const s = samples[nextRef.current % samples.length]!
        nextRef.current += 1
        onAttach({
          id: `${s.name}-${Math.random().toString(36).slice(2, 7)}`,
          name: s.name,
          size: s.size,
        })
      }}
      className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label="Attach a file"
    >
      <Paperclip className="size-4" />
    </button>
  )
}
