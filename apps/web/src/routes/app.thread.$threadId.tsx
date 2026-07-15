import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { getMessages, getNeedsYou, getThread } from '@revido/mock-data'
import { Button } from '@revido/ui'
import { ArrowLeft, Inbox } from 'lucide-react'
import * as React from 'react'
import { MessageItem } from '@/components/thread/message-item'
import { ReplyZone } from '@/components/thread/reply-zone'
import { ThreadSummaryCard } from '@/components/thread/thread-summary-card'
import { ThreadTopBar } from '@/components/thread/thread-topbar'

export const Route = createFileRoute('/app/thread/$threadId')({
  component: ThreadTakeover,
})

function ThreadTakeover() {
  const { threadId } = Route.useParams()
  const navigate = useNavigate()
  const thread = getThread(threadId)

  // j/k next/prev within the Focused Inbox order; e archives + advances; esc → inbox.
  const goInbox = React.useCallback(() => navigate({ to: '/app/inbox' }), [navigate])

  const goSibling = React.useCallback(
    (delta: number) => {
      const siblings = getNeedsYou()
      if (siblings.length === 0) return
      const idx = siblings.findIndex((t) => t.id === threadId)
      const next =
        idx === -1 ? siblings[0] : siblings[(idx + delta + siblings.length) % siblings.length]
      if (next && next.id !== threadId)
        void navigate({ to: '/app/thread/$threadId', params: { threadId: next.id } })
    },
    [navigate, threadId],
  )

  const archiveAndAdvance = React.useCallback(() => {
    const siblings = getNeedsYou()
    const idx = siblings.findIndex((t) => t.id === threadId)
    const next = idx === -1 ? undefined : siblings[(idx + 1) % siblings.length]
    if (next && next.id !== threadId)
      void navigate({ to: '/app/thread/$threadId', params: { threadId: next.id } })
    else void goInbox()
  }, [navigate, threadId, goInbox])

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTyping(e.target)) return
      switch (e.key) {
        case 'j':
          e.preventDefault()
          goSibling(1)
          break
        case 'k':
          e.preventDefault()
          goSibling(-1)
          break
        case 'e':
          e.preventDefault()
          archiveAndAdvance()
          break
        case 'Escape':
          e.preventDefault()
          void goInbox()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goSibling, archiveAndAdvance, goInbox])

  if (!thread) return <NotFound />

  const messages = getMessages(threadId)
  const lastId = messages[messages.length - 1]?.id

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <ThreadTopBar thread={thread} onBack={goInbox} onArchive={archiveAndAdvance} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          <ThreadSummaryCard thread={thread} />

          <div className="mt-5 space-y-2.5">
            {messages.map((m) => (
              <MessageItem key={m.id} message={m} defaultOpen={m.id === lastId} />
            ))}
          </div>
        </div>
      </div>

      <ReplyZone thread={thread} />
    </div>
  )
}

function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Inbox className="size-6" />
      </div>
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Thread not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This conversation may have been archived or moved.
        </p>
      </div>
      <Button asChild variant="primary">
        <Link to="/app/inbox">
          <ArrowLeft className="size-4" /> Back to inbox
        </Link>
      </Button>
    </div>
  )
}

/** True when focus is in a text field — suppresses single-key shortcuts. */
function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}
