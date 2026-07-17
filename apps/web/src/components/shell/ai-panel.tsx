// i18n-todo: extract hardcoded copy in this component to the en/nl catalogs (see apps/web/src/i18n)
import { Link, useParams } from '@tanstack/react-router'
import type { ExtractedFact } from '@revido/db'
import {
  AiTag,
  Badge,
  Button,
  Checkbox,
  ScrollArea,
  Separator,
  Sparkle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from '@revido/ui'
import {
  ArrowUp,
  Calendar,
  CircleDollarSign,
  Link2,
  PanelRightClose,
  Sparkles,
  Truck,
  X,
} from 'lucide-react'
import * as React from 'react'
import { useAppState } from '@/lib/app-state'
import { useAiChat } from '@/lib/hooks/ai'
import { useMessages, useNeedsYou, useThread, useToday, useToggleExtractedFact } from '@/lib/hooks'

const factIcon: Record<ExtractedFact['type'], React.ReactNode> = {
  date: <Calendar className="size-3.5" />,
  amount: <CircleDollarSign className="size-3.5" />,
  tracking: <Truck className="size-3.5" />,
  link: <Link2 className="size-3.5" />,
  action: <Sparkles className="size-3.5" />,
  contact: <Sparkles className="size-3.5" />,
}

export function AIPanel() {
  const { aiPanelOpen, setAiPanelOpen, mobileAiOpen, setMobileAiOpen, aiTab, setAiTab } =
    useAppState()
  const params = useParams({ strict: false }) as { threadId?: string }
  const threadId = params.threadId

  const renderHeader = (onClose: () => void, label: string, icon: React.ReactNode) => (
    <div className="flex items-center justify-between px-4 pt-3.5">
      <div className="flex items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-lg bg-ai/12">
          <Sparkles className="size-4 text-ai" />
        </div>
        <span className="text-base font-semibold">Assistant</span>
      </div>
      <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={label}>
        {icon}
      </Button>
    </div>
  )

  // The body renders in both the desktop and mobile asides; only the `primary`
  // (desktop) instance consumes the command-palette "Ask AI" query so it isn't
  // sent twice.
  const renderBody = (primary: boolean) => (
    <Tabs
      value={aiTab}
      onValueChange={(v) => setAiTab(v as 'insights' | 'chat')}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="px-4 pt-3">
        <TabsList className="w-full">
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="insights" className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div className="p-4">
            {threadId ? <ThreadInsights threadId={threadId} /> : <DayInsights />}
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col">
        <ChatTab threadId={threadId} consumeQuery={primary} />
      </TabsContent>
    </Tabs>
  )

  return (
    <>
      {/* Desktop (lg+): static right column, or a thin reopen rail. */}
      {aiPanelOpen ? (
        <aside className="hidden h-full w-95 shrink-0 flex-col glass-thin border-y-0 border-r-0 lg:flex">
          {renderHeader(
            () => setAiPanelOpen(false),
            'Collapse panel (⌘J)',
            <PanelRightClose className="size-4" />,
          )}
          {renderBody(true)}
        </aside>
      ) : (
        <div className="hidden h-full w-12 shrink-0 flex-col items-center glass-thin border-y-0 border-r-0 py-3 lg:flex">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setAiPanelOpen(true)}
            aria-label="Open AI panel (⌘J)"
          >
            <Sparkles className="size-4 text-ai" />
          </Button>
        </div>
      )}

      {/* Mobile (<lg): a glass slide-over over a dimmed backdrop. */}
      <div
        className={cn('fixed inset-0 z-50 lg:hidden', !mobileAiOpen && 'pointer-events-none')}
        aria-hidden={!mobileAiOpen}
      >
        <div
          className={cn(
            'absolute inset-0 bg-foreground/25 transition-opacity duration-200',
            mobileAiOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={() => setMobileAiOpen(false)}
        />
        <aside
          className={cn(
            'glass absolute inset-y-0 right-0 flex w-11/12 max-w-sm flex-col transition-transform duration-200',
            mobileAiOpen ? 'translate-x-0' : 'translate-x-full',
          )}
        >
          {renderHeader(() => setMobileAiOpen(false), 'Close assistant', <X className="size-4" />)}
          {renderBody(false)}
        </aside>
      </div>
    </>
  )
}

function ThreadInsights({ threadId }: { threadId: string }) {
  const { data: thread, isPending } = useThread(threadId)
  const { data: messages } = useMessages(threadId)
  const toggleFact = useToggleExtractedFact()

  if (isPending) return <PanelSkeleton />
  if (!thread) return null

  // Preserve each fact's index within `thread.extracted` so the toggle hits the
  // right row server-side.
  const actions = thread.extracted
    .map((fact, index) => ({ fact, index }))
    .filter((f) => f.fact.type === 'action')
  const facts = thread.extracted.filter((f) => f.type !== 'action')
  const messageCount = messages?.length ?? 0

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-2 flex items-center gap-1.5">
          <Sparkle />
          <h4 className="text-sm font-semibold">Summary</h4>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{thread.summary}</p>
      </section>

      {actions.length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-semibold">Action items</h4>
          <div className="space-y-2">
            {actions.map(({ fact, index }) => (
              <label key={index} className="flex items-start gap-2.5 text-sm">
                <Checkbox
                  defaultChecked={fact.done}
                  className="mt-0.5"
                  onCheckedChange={(v) =>
                    toggleFact.mutate({ id: thread.id, index, done: v === true })
                  }
                />
                <span className="text-muted-foreground">{fact.label}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      {facts.length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-semibold">Extracted</h4>
          <div className="flex flex-wrap gap-1.5">
            {facts.map((f, i) => (
              <Badge key={i} variant="outline" className="gap-1.5 py-1">
                {factIcon[f.type]}
                <span className="text-muted-foreground">{f.label}:</span>
                <span className="font-medium">{f.value}</span>
              </Badge>
            ))}
          </div>
        </section>
      )}

      <Separator />
      <div className="text-2xs text-muted-foreground/70">
        {messageCount} message{messageCount === 1 ? '' : 's'} in this thread
      </div>
    </div>
  )
}

function DayInsights() {
  const { data: brief, isPending } = useToday()
  const { data: needsYou } = useNeedsYou()

  if (isPending) return <PanelSkeleton />
  const stats = brief?.stats

  return (
    <div className="space-y-5">
      {stats && (
        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <Sparkle />
            <h4 className="text-sm font-semibold">Your day</h4>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat n={stats.needYou} label="need you" tone="text-primary" />
            <Stat n={stats.promises} label="promises" tone="text-cat-awaiting-reply" />
            <Stat n={stats.agentsHandled} label="handled" tone="text-ai" />
          </div>
        </section>
      )}
      {stats && <Separator />}
      <section className="space-y-2.5">
        <h4 className="text-sm font-semibold">Worth your attention</h4>
        {(needsYou ?? []).slice(0, 3).map((t) => (
          <Link
            key={t.id}
            to="/app/thread/$threadId"
            params={{ threadId: t.id }}
            className="block rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40"
          >
            <div className="truncate text-sm font-medium">{t.subject}</div>
            <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.tldr}</div>
          </Link>
        ))}
      </section>
      <div className="rounded-xl border border-ai/20 bg-ai/5 p-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Tip:</span> Ask me anything about your inbox
        in the Chat tab — “what did John say about the contract?”
      </div>
    </div>
  )
}

function PanelSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      <div className="h-3 w-full animate-pulse rounded bg-muted" />
      <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
      <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
    </div>
  )
}

function Stat({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-2.5 text-center">
      <div className={cn('text-xl font-semibold tabular-nums', tone)}>{n}</div>
      <div className="text-2xs text-muted-foreground">{label}</div>
    </div>
  )
}

interface ChatMsg {
  role: 'user' | 'ai'
  text: string
  citations?: { threadId: string; label: string }[]
}

function ChatTab({ threadId, consumeQuery }: { threadId?: string; consumeQuery: boolean }) {
  const { aiChatQuery, setAiChatQuery } = useAppState()
  const { text, isStreaming, citations, start, reset } = useAiChat()
  const [input, setInput] = React.useState('')
  const [messages, setMessages] = React.useState<ChatMsg[]>([])
  const committedRef = React.useRef(true)
  const endRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, text, isStreaming])

  const send = React.useCallback(
    (question: string) => {
      const q = question.trim()
      if (!q || isStreaming) return
      setMessages((prev) => [...prev, { role: 'user', text: q }])
      setInput('')
      committedRef.current = false
      void start({ threadId, message: q })
    },
    [isStreaming, start, threadId],
  )

  // Commit the streamed answer (with its citations) once the stream ends.
  React.useEffect(() => {
    if (!isStreaming && !committedRef.current && text) {
      committedRef.current = true
      setMessages((prev) => [...prev, { role: 'ai', text, citations }])
      reset()
    }
  }, [isStreaming, text, citations, reset])

  // Pick up an "Ask AI" query handed over from the command palette. Only the
  // primary (desktop) panel consumes it, so it isn't sent twice.
  React.useEffect(() => {
    if (consumeQuery && aiChatQuery && aiChatQuery.trim()) {
      send(aiChatQuery)
      setAiChatQuery(null)
    }
  }, [consumeQuery, aiChatQuery, send, setAiChatQuery])

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          {messages.length === 0 && !isStreaming && (
            <div className="rounded-xl border border-ai/20 bg-ai/5 p-3 text-sm text-muted-foreground">
              <AiTag className="mb-1.5" />
              <p>Ask about your inbox — “what did I promise Priya?” or “find that $48k proposal.”</p>
            </div>
          )}
          {messages.map((m, i) => (
            <ChatBubble key={i} message={m} />
          ))}
          {isStreaming && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl border border-border bg-card px-3.5 py-2.5 text-sm">
                <AiTag className="mb-1.5" />
                {text ? (
                  <p className="text-muted-foreground">{text}</p>
                ) : (
                  <p className="animate-pulse text-muted-foreground">Thinking…</p>
                )}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </ScrollArea>
      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2 rounded-2xl border border-input bg-card p-2 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
            rows={1}
            placeholder="Ask about your inbox…"
            className="max-h-28 min-h-6 flex-1 resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted-foreground/70"
          />
          <Button
            size="icon-sm"
            variant="ai"
            aria-label="Send"
            onClick={() => send(input)}
            disabled={!input.trim() || isStreaming}
          >
            <ArrowUp className="size-4" />
          </Button>
        </div>
        <p className="mt-1.5 text-center text-2xs text-muted-foreground/70">
          Answers cite the emails they came from.
        </p>
      </div>
    </>
  )
}

function ChatBubble({ message }: { message: ChatMsg }) {
  return (
    <div className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm',
          message.role === 'user'
            ? 'bg-primary text-primary-foreground'
            : 'border border-border bg-card',
        )}
      >
        {message.role === 'ai' && <AiTag className="mb-1.5" />}
        <p className={message.role === 'ai' ? 'text-muted-foreground' : ''}>{message.text}</p>
        {message.citations && message.citations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.citations.map((c) => (
              <Link
                key={c.threadId}
                to="/app/thread/$threadId"
                params={{ threadId: c.threadId }}
                className="inline-flex items-center gap-1 rounded-full bg-ai/12 px-2 py-0.5 text-2xs font-medium text-ai hover:brightness-95"
              >
                <Link2 className="size-3" />
                {c.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
