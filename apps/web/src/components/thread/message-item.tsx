// i18n-todo: extract hardcoded copy in this component to the en/nl catalogs (see apps/web/src/i18n)
import { USER, type Attachment, type Message } from '@revido/mock-data'
import { Badge, ContactAvatar, cn } from '@revido/ui'
import { File, FileArchive, FileText, Image as ImageIcon, ImageOff, Sheet } from 'lucide-react'
import * as React from 'react'
import { EmailFrame } from './email-frame'

export function MessageItem({ message, defaultOpen }: { message: Message; defaultOpen: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen)
  const [showImages, setShowImages] = React.useState(false)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-3 rounded-xl border border-border/70 bg-card/60 px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
      >
        <ContactAvatar name={message.from.name} className="size-7 shrink-0" />
        <span className="shrink-0 text-sm font-medium">{message.from.name}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          {message.text}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{formatShort(message.date)}</span>
      </button>
    )
  }

  return (
    <article
      className={cn(
        'overflow-hidden rounded-2xl border shadow-soft',
        message.outbound ? 'border-primary/20 bg-primary/5' : 'border-border bg-card',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="flex w-full items-start gap-3 px-4 pt-4 text-left"
      >
        <ContactAvatar name={message.from.name} className="size-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{message.from.name}</span>
            {message.outbound && (
              <Badge variant="outline" className="shrink-0">
                Sent
              </Badge>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {message.from.email} · to {recipients(message)}
          </div>
        </div>
        <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">
          {formatFull(message.date)}
        </span>
      </button>

      {message.imagesBlocked && !showImages && (
        <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-3 py-2">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <ImageOff className="size-3.5 shrink-0" />
            Images blocked to protect your privacy
          </span>
          <button
            type="button"
            onClick={() => setShowImages(true)}
            className="shrink-0 text-xs font-medium text-primary hover:underline"
          >
            Show images
          </button>
        </div>
      )}

      <div className="px-4 py-3">
        <EmailFrame html={message.html} />
      </div>

      {message.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          {message.attachments.map((a) => (
            <AttachmentChip key={a.id} attachment={a} />
          ))}
        </div>
      )}
    </article>
  )
}

const attachmentIcon: Record<Attachment['kind'], React.ReactNode> = {
  pdf: <FileText className="size-4" />,
  image: <ImageIcon className="size-4" />,
  doc: <FileText className="size-4" />,
  sheet: <Sheet className="size-4" />,
  zip: <FileArchive className="size-4" />,
  other: <File className="size-4" />,
}

function AttachmentChip({ attachment }: { attachment: Attachment }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2.5 rounded-xl border border-border bg-muted/40 px-2.5 py-1.5 text-left transition-colors hover:bg-muted"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-card text-muted-foreground">
        {attachmentIcon[attachment.kind]}
      </span>
      <span className="min-w-0">
        <span className="block max-w-40 truncate text-xs font-medium">{attachment.name}</span>
        <span className="block text-2xs uppercase tracking-wide text-muted-foreground">
          {attachment.size}
        </span>
      </span>
    </button>
  )
}

function recipients(message: Message): string {
  const names = message.to.map((t) => (t.email === USER.email ? 'you' : t.name))
  return names.join(', ') || 'you'
}

function formatShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatFull(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
