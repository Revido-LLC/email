// i18n-todo: extract hardcoded copy in this screen to the en/nl catalogs (see apps/web/src/i18n)
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button } from '@revido/ui'
import { ArrowLeft, Inbox, Loader2 } from 'lucide-react'
import * as React from 'react'
import { MessageItem } from '@/components/thread/message-item'
import { ReplyZone } from '@/components/thread/reply-zone'
import { ThreadSummaryCard } from '@/components/thread/thread-summary-card'
import { ThreadTopBar } from '@/components/thread/thread-topbar'
import { useArchiveThread, useMessages, useNeedsYou, useThread } from '@/lib/hooks'

export const Route = createFileRoute('/app/thread/$threadId')({
  component: ThreadTakeover,
})

function ThreadTakeover() {
  const { threadId } = Route.useParams()
  const navigate = useNavigate()
  const { data: thread, isPending } = useThread(threadId)
  const { data: messages } = useMessages(threadId)
  const { data: siblingData } = useNeedsYou()
  const archiveThread = useArchiveThread()

  // Read siblings through a ref so the keyboard callbacks don't need to re-bind
  // as the query refetches.
  const siblingsRef = React.useRef(siblingData ?? [])
  siblingsRef.current = siblingData ?? []

  // j/k next/prev within the Focused Inbox order; e archives + advances; esc → inbox.
  const goInbox = React.useCallback(() => navigate({ to: '/app/inbox' }), [navigate])

  const goSibling = React.useCallback(
    (delta: number) => {
      const siblings = siblingsRef.current
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
    const siblings = siblingsRef.current
    const idx = siblings.findIndex((t) => t.id === threadId)
    const next = idx === -1 ? undefined : siblings[(idx + 1) % siblings.length]
    archiveThread.mutate(threadId)
    if (next && next.id !== threadId)
      void navigate({ to: '/app/thread/$threadId', params: { threadId: next.id } })
    else void goInbox()
  }, [navigate, threadId, goInbox, archiveThread])

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

  if (isPending) return <ThreadLoading />
  if (!thread) return <NotFound />

  const threadMessages = messages ?? []
  const lastId = threadMessages[threadMessages.length - 1]?.id

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <ThreadTopBar thread={thread} onBack={goInbox} onArchive={archiveAndAdvance} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          <ThreadSummaryCard thread={thread} />

          <div className="mt-5 space-y-2.5">
            {threadMessages.map((m) => (
              <MessageItem key={m.id} message={m} defaultOpen={m.id === lastId} />
            ))}
          </div>
        </div>
      </div>

      <ReplyZone thread={thread} />
    </div>
  )
}

function ThreadLoading() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
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
