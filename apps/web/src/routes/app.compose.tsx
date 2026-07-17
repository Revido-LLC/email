// i18n-todo: extract hardcoded copy in this screen to the en/nl catalogs (see apps/web/src/i18n)
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import type { Contact } from '@revido/db'
import { useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Bell, CheckCircle2, CornerDownLeft, Inbox, PenLine, X } from 'lucide-react'
import * as React from 'react'
import { Button, Checkbox, Kbd } from '@revido/ui'
import {
  AttachButton,
  AttachmentsZone,
  formatBytes,
  type ComposerAttachment,
} from '@/components/composer/attachments-zone'
import { ComposerEditor } from '@/components/composer/composer-editor'
import { draftToHtml, type ToneKey } from '@/components/composer/draft-data'
import { PromptBar } from '@/components/composer/prompt-bar'
import { RecipientsField } from '@/components/composer/recipients-field'
import { UndoToast } from '@/components/composer/undo-toast'
import { useAiDraft, useAiRewrite } from '@/lib/hooks/ai'
import { useCancelSend, useSendMessage, useUploadAttachment } from '@/lib/hooks'
import { useSignatures } from '@/lib/hooks'

export const Route = createFileRoute('/app/compose')({
  component: ComposeScreen,
})

type SendStatus = 'composing' | 'sending' | 'sent'

function ComposeScreen() {
  const navigate = useNavigate()
  const { data: signatures } = useSignatures()
  const signatureHtml = signatures?.[0]?.html ?? ''

  const [recipients, setRecipients] = React.useState<string[]>([])
  const [subject, setSubject] = React.useState('')
  const [attachments, setAttachments] = React.useState<ComposerAttachment[]>([])
  const [remind, setRemind] = React.useState(false)
  const [status, setStatus] = React.useState<SendStatus>('composing')

  // Attachment uploads: each dropped/picked file POSTs to /attachments and its
  // returned id is collected for send. Chips reflect per-file upload state.
  const uploadAttachment = useUploadAttachment()
  const uploading = attachments.some((a) => a.status === 'uploading')

  const handleAddFiles = React.useCallback(
    (files: File[]) => {
      for (const file of files) {
        const localId = `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`
        setAttachments((prev) => [
          ...prev,
          { localId, name: file.name, size: formatBytes(file.size), status: 'uploading' },
        ])
        uploadAttachment.mutate(file, {
          onSuccess: (att) =>
            setAttachments((prev) =>
              prev.map((a) =>
                a.localId === localId
                  ? { ...a, status: 'ready', serverId: att.id, size: att.size }
                  : a,
              ),
            ),
          onError: () =>
            setAttachments((prev) =>
              prev.map((a) => (a.localId === localId ? { ...a, status: 'error' } : a)),
            ),
        })
      }
    },
    [uploadAttachment],
  )

  const handleRemoveAttachment = React.useCallback((localId: string) => {
    setAttachments((prev) => prev.filter((a) => a.localId !== localId))
  }, [])

  // AI writing — draft (POST /ai/draft) and tone rewrite (POST /ai/rewrite) are
  // SSE token streams; the active one's text is pushed into the editor as it lands.
  const draft = useAiDraft()
  const rewrite = useAiRewrite()
  const [activeStream, setActiveStream] = React.useState<'draft' | 'rewrite' | null>(null)
  const [activeTone, setActiveTone] = React.useState<ToneKey | null>(null)
  const [hasDraft, setHasDraft] = React.useState(false)

  const streaming = draft.isStreaming || rewrite.isStreaming
  const streamText = activeStream === 'rewrite' ? rewrite.text : activeStream === 'draft' ? draft.text : ''

  // Send / undo-send.
  const sendMessage = useSendMessage()
  const cancelSend = useCancelSend()
  const [sentMessageId, setSentMessageId] = React.useState<string | null>(null)

  // Bumping this remounts the composing view to reset all field state.
  const [composeKey, setComposeKey] = React.useState(0)

  const editor = useEditor({
    extensions: [StarterKit],
    content: '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'email-body min-h-64 px-4 py-3 focus:outline-none',
      },
    },
  })

  // Mirror the streamed text into the editor. Keeping focus at the end reads as
  // live typing and stops stray single-key global shortcuts from firing.
  React.useEffect(() => {
    if (!editor || activeStream === null) return
    editor.commands.setContent(draftToHtml(streamText), false)
    editor.commands.focus('end')
  }, [editor, streamText, activeStream])

  const handleDraft = React.useCallback(
    (prompt: string) => {
      setActiveStream('draft')
      setActiveTone('default')
      setHasDraft(true)
      void draft.start({ prompt })
    },
    [draft],
  )

  const handleTone = React.useCallback(
    (tone: ToneKey) => {
      const current = editor?.getText().trim() ?? ''
      if (!current) return
      setActiveStream('rewrite')
      setActiveTone(tone)
      void rewrite.start({ draft: current, tone })
    },
    [editor, rewrite],
  )

  const handleSend = React.useCallback(() => {
    if (status !== 'composing') return
    if (sendMessage.isPending) return
    // Don't send mid-upload — an id that hasn't landed yet would be dropped.
    if (attachments.some((a) => a.status === 'uploading')) return
    const attachmentIds = attachments
      .filter((a) => a.status === 'ready' && a.serverId)
      .map((a) => a.serverId!)
    setStatus('sending')
    sendMessage.mutate(
      {
        to: recipients.map((r): Contact => ({ name: r, email: r })),
        subject,
        html: editor?.getHTML() ?? '',
        attachmentIds,
        remindIfNoReply: remind,
      },
      {
        onSuccess: (message) => setSentMessageId(message.id),
        onError: () => setStatus('composing'),
      },
    )
  }, [status, sendMessage, recipients, subject, editor, remind, attachments])

  // ⌘↵ / Ctrl+↵ sends.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSend()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSend])

  function composeAnother() {
    draft.reset()
    rewrite.reset()
    editor?.commands.clearContent()
    editor?.setEditable(true)
    setRecipients([])
    setSubject('')
    setAttachments([])
    setRemind(false)
    setActiveStream(null)
    setActiveTone(null)
    setHasDraft(false)
    setSentMessageId(null)
    setStatus('composing')
    setComposeKey((k) => k + 1)
  }

  if (status === 'sent') {
    return <SentConfirmation onCompose={composeAnother} onInbox={() => navigate({ to: '/app' })} />
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div key={composeKey} className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          {/* Header */}
          <header className="mb-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <PenLine className="size-4.5" />
              </span>
              <div>
                <h1 className="text-lg font-semibold tracking-tight">New message</h1>
                <p className="text-xs text-muted-foreground">
                  Draft it yourself, or let AI start you off.
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => navigate({ to: '/app' })}
              aria-label="Close composer"
            >
              <X className="size-4" />
            </Button>
          </header>

          {/* Recipient + subject fields */}
          <div className="mb-4 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
            <div className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-16 shrink-0 text-sm font-medium text-muted-foreground">To</span>
              <RecipientsField recipients={recipients} onChange={setRecipients} />
            </div>
            <div className="h-px bg-border" />
            <div className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-16 shrink-0 text-sm font-medium text-muted-foreground">
                Subject
              </span>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Add a subject…"
                className="h-7 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
              />
            </div>
          </div>

          {/* AI prompt bar + tone chips */}
          <div className="mb-4">
            <PromptBar
              onDraft={handleDraft}
              onTone={handleTone}
              activeTone={activeTone}
              streaming={streaming}
              hasDraft={hasDraft}
            />
          </div>

          {/* Editor */}
          <div className="mb-4">
            <ComposerEditor editor={editor} streaming={streaming} signatureHtml={signatureHtml} />
          </div>

          {/* Attachments */}
          <AttachmentsZone
            attachments={attachments}
            onAddFiles={handleAddFiles}
            onRemove={handleRemoveAttachment}
          />
        </div>
      </div>

      {/* Sticky bottom bar */}
      <div className="glass-thin border-x-0 border-b-0">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <AttachButton onFiles={handleAddFiles} />
            <label className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <Checkbox checked={remind} onCheckedChange={(v) => setRemind(v === true)} />
              <span className="flex items-center gap-1.5">
                <Bell className="size-3.5" />
                Remind me if no reply in 3 days
              </span>
            </label>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate({ to: '/app' })}>
              Discard
            </Button>
            <Button
              variant="primary"
              onClick={handleSend}
              disabled={uploading}
              className="gap-2.5"
            >
              {uploading ? 'Uploading…' : 'Send'}
              <span className="flex items-center gap-1">
                <Kbd className="bg-primary-foreground/15 text-primary-foreground">⌘</Kbd>
                <Kbd className="bg-primary-foreground/15 text-primary-foreground">
                  <CornerDownLeft className="size-3" />
                </Kbd>
              </span>
            </Button>
          </div>
        </div>
      </div>

      {status === 'sending' && (
        <UndoToast
          onUndo={() => {
            if (sentMessageId) cancelSend.mutate(sentMessageId)
            setStatus('composing')
          }}
          onComplete={() => setStatus('sent')}
        />
      )}
    </div>
  )
}

function SentConfirmation({ onCompose, onInbox }: { onCompose: () => void; onInbox: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-6 text-center shadow-soft sm:p-10 animate-in fade-in-0 zoom-in-95">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-success/15 text-success">
          <CheckCircle2 className="size-8" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Message sent</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Your email is on its way. We’ll keep an eye out for a reply.
          </p>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2.5">
          <Button variant="outline" onClick={onInbox}>
            <Inbox className="size-4" /> Back to inbox
          </Button>
          <Button variant="primary" onClick={onCompose}>
            <PenLine className="size-4" /> Compose another
          </Button>
        </div>
      </div>
    </div>
  )
}
