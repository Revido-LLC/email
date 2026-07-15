import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { SIGNATURES } from '@revido/mock-data'
import { useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Bell, CheckCircle2, CornerDownLeft, Inbox, PenLine, X } from 'lucide-react'
import * as React from 'react'
import { Button, Checkbox, Kbd } from '@revido/ui'
import {
  AttachButton,
  AttachmentsZone,
  type MockAttachment,
} from '@/components/composer/attachments-zone'
import { ComposerEditor } from '@/components/composer/composer-editor'
import {
  buildDraftHtml,
  findScenario,
  pickScenario,
  totalWords,
  type ToneKey,
} from '@/components/composer/draft-data'
import { PromptBar } from '@/components/composer/prompt-bar'
import { RecipientsField } from '@/components/composer/recipients-field'
import { UndoToast } from '@/components/composer/undo-toast'

export const Route = createFileRoute('/app/compose')({
  component: ComposeScreen,
})

type SendStatus = 'composing' | 'sending' | 'sent'

const SIGNATURE_HTML = SIGNATURES[0]?.html ?? ''

function ComposeScreen() {
  const navigate = useNavigate()

  const [subject, setSubject] = React.useState('')
  const [attachments, setAttachments] = React.useState<MockAttachment[]>([])
  const [remind, setRemind] = React.useState(false)
  const [status, setStatus] = React.useState<SendStatus>('composing')

  // AI draft state
  const [streaming, setStreaming] = React.useState(false)
  const [scenarioId, setScenarioId] = React.useState<string | null>(null)
  const [activeTone, setActiveTone] = React.useState<ToneKey | null>(null)
  const intervalRef = React.useRef<number | null>(null)

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

  const stopStream = React.useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  React.useEffect(() => stopStream, [stopStream])

  const streamParagraphs = React.useCallback(
    (paragraphs: string[]) => {
      if (!editor) return
      stopStream()
      const total = totalWords(paragraphs)
      let revealed = 0
      setStreaming(true)
      // Keep focus inside the editor (a contentEditable region) for the whole
      // stream: it reads as live typing, and it stops stray single-key global
      // shortcuts from firing while a button/chip triggered the draft.
      editor.commands.setContent('', false)
      editor.commands.focus('end')
      intervalRef.current = window.setInterval(() => {
        revealed += 2
        editor.commands.setContent(buildDraftHtml(paragraphs, Math.min(revealed, total)), false)
        editor.commands.focus('end')
        if (revealed >= total) {
          stopStream()
          setStreaming(false)
        }
      }, 45)
    },
    [editor, stopStream],
  )

  const handleDraft = React.useCallback(
    (prompt: string) => {
      const scenario = pickScenario(prompt)
      setScenarioId(scenario.id)
      setActiveTone('default')
      setSubject((s) => (s.trim() ? s : scenario.subject))
      streamParagraphs(scenario.tone.default)
    },
    [streamParagraphs],
  )

  const handleTone = React.useCallback(
    (tone: ToneKey) => {
      const scenario = findScenario(scenarioId)
      setScenarioId(scenario.id)
      setActiveTone(tone)
      streamParagraphs(scenario.tone[tone])
    },
    [scenarioId, streamParagraphs],
  )

  const handleSend = React.useCallback(() => {
    setStatus((s) => (s === 'composing' ? 'sending' : s))
  }, [])

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
    stopStream()
    editor?.commands.clearContent()
    editor?.setEditable(true)
    setSubject('')
    setAttachments([])
    setRemind(false)
    setScenarioId(null)
    setActiveTone(null)
    setStreaming(false)
    setStatus('composing')
    setComposeKey((k) => k + 1)
  }

  if (status === 'sent') {
    return <SentConfirmation onCompose={composeAnother} onInbox={() => navigate({ to: '/app' })} />
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div key={composeKey} className="mx-auto max-w-3xl px-6 py-8">
          {/* Header */}
          <header className="mb-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <PenLine className="size-4.5" />
              </span>
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-tight">New message</h1>
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
              <RecipientsField />
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
              hasDraft={scenarioId !== null}
            />
          </div>

          {/* Editor */}
          <div className="mb-4">
            <ComposerEditor editor={editor} streaming={streaming} signatureHtml={SIGNATURE_HTML} />
          </div>

          {/* Attachments */}
          <AttachmentsZone
            attachments={attachments}
            onAdd={(files) => setAttachments((prev) => [...prev, ...files])}
            onRemove={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
          />
        </div>
      </div>

      {/* Sticky bottom bar */}
      <div className="border-t border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <AttachButton onAttach={(file) => setAttachments((prev) => [...prev, file])} />
            <label className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <Checkbox checked={remind} onCheckedChange={(v) => setRemind(v === true)} />
              <span className="flex items-center gap-1.5">
                <Bell className="size-3.5" />
                Remind me if no reply in 3 days
              </span>
            </label>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate({ to: '/app' })}>
              Discard
            </Button>
            <Button variant="primary" onClick={handleSend} className="gap-2.5">
              Send
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
        <UndoToast onUndo={() => setStatus('composing')} onComplete={() => setStatus('sent')} />
      )}
    </div>
  )
}

function SentConfirmation({ onCompose, onInbox }: { onCompose: () => void; onInbox: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-3xl border border-border bg-gradient-to-br from-success/10 via-card to-card p-10 text-center shadow-soft animate-in fade-in-0 zoom-in-95">
        <span className="flex size-16 items-center justify-center rounded-3xl bg-success/15 text-success">
          <CheckCircle2 className="size-8" />
        </span>
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Message sent</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Your email is on its way. We’ll keep an eye out for a reply.
          </p>
        </div>
        <div className="mt-1 flex items-center gap-2.5">
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
