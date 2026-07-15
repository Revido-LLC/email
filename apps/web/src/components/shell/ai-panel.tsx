import { Link, useParams } from '@tanstack/react-router'
import {
  TODAY_BRIEF,
  getMessages,
  getThread,
  type ExtractedFact,
  type Thread,
} from '@revido/mock-data'
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
} from 'lucide-react'
import * as React from 'react'
import { useAppState } from '@/lib/app-state'

const factIcon: Record<ExtractedFact['type'], React.ReactNode> = {
  date: <Calendar className="size-3.5" />,
  amount: <CircleDollarSign className="size-3.5" />,
  tracking: <Truck className="size-3.5" />,
  link: <Link2 className="size-3.5" />,
  action: <Sparkles className="size-3.5" />,
  contact: <Sparkles className="size-3.5" />,
}

export function AIPanel() {
  const { aiPanelOpen, setAiPanelOpen, aiTab, setAiTab } = useAppState()
  const params = useParams({ strict: false }) as { threadId?: string }
  const thread = params.threadId ? getThread(params.threadId) : undefined

  if (!aiPanelOpen) {
    return (
      <div className="flex h-full w-12 shrink-0 flex-col items-center border-l border-border bg-subtle py-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setAiPanelOpen(true)}
          aria-label="Open AI panel (⌘J)"
        >
          <Sparkles className="size-4 text-ai" />
        </Button>
      </div>
    )
  }

  return (
    <aside className="flex h-full w-95 shrink-0 flex-col border-l border-border bg-subtle">
      <div className="flex items-center justify-between px-4 pt-3.5">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-ai/12">
            <Sparkles className="size-4 text-ai" />
          </div>
          <span className="font-display text-base font-semibold">Assistant</span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setAiPanelOpen(false)}
          aria-label="Collapse panel (⌘J)"
        >
          <PanelRightClose className="size-4" />
        </Button>
      </div>

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
              {thread ? <ThreadInsights thread={thread} /> : <DayInsights />}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col">
          <ChatTab />
        </TabsContent>
      </Tabs>
    </aside>
  )
}

function ThreadInsights({ thread }: { thread: Thread }) {
  const messages = getMessages(thread.id)
  const actions = thread.extracted.filter((f) => f.type === 'action')
  const facts = thread.extracted.filter((f) => f.type !== 'action')
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
            {actions.map((a, i) => (
              <label key={i} className="flex items-start gap-2.5 text-sm">
                <Checkbox defaultChecked={a.done} className="mt-0.5" />
                <span className="text-muted-foreground">{a.label}</span>
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
      <section>
        <div className="mb-2 flex items-center gap-1.5">
          <Sparkle />
          <h4 className="text-sm font-semibold">Suggested reply</h4>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
          {suggestedReply(thread)}
        </div>
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="ai" className="flex-1">
            <Sparkles className="size-3.5" /> Use draft
          </Button>
          <Button size="sm" variant="outline">
            Edit
          </Button>
        </div>
      </section>

      <div className="text-2xs text-muted-foreground/70">
        {messages.length} message{messages.length === 1 ? '' : 's'} in this thread
      </div>
    </div>
  )
}

function suggestedReply(thread: Thread): string {
  if (thread.category === 'to-reply' && thread.id === 't-acme')
    return 'Hi John — yes, the $48,000 includes the analytics dashboard, and July 22 works for kickoff. I’ll send a calendar hold. Thursday call sounds great.'
  return 'Thanks for the note — happy to help. Let me pull the details together and get back to you shortly.'
}

function DayInsights() {
  const { stats } = TODAY_BRIEF
  return (
    <div className="space-y-5">
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
      <Separator />
      <section className="space-y-2.5">
        <h4 className="text-sm font-semibold">Worth your attention</h4>
        {TODAY_BRIEF.needsYou.slice(0, 3).map((id) => {
          const t = getThread(id)
          if (!t) return null
          return (
            <Link
              key={id}
              to="/app/thread/$threadId"
              params={{ threadId: id }}
              className="block rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40"
            >
              <div className="truncate text-sm font-medium">{t.subject}</div>
              <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.tldr}</div>
            </Link>
          )
        })}
      </section>
      <div className="rounded-xl bg-gradient-to-br from-ai/10 to-primary/10 p-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Tip:</span> Ask me anything about your inbox
        in the Chat tab — “what did John say about the contract?”
      </div>
    </div>
  )
}

function Stat({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-2.5 text-center">
      <div className={cn('font-display text-xl font-semibold', tone)}>{n}</div>
      <div className="text-2xs text-muted-foreground">{label}</div>
    </div>
  )
}

interface ChatMsg {
  role: 'user' | 'ai'
  text: string
  citations?: { threadId: string; label: string }[]
}
const SEED_CHAT: ChatMsg[] = [
  { role: 'user', text: 'What did John say about the contract?' },
  {
    role: 'ai',
    text: 'John approved the Q3 proposal direction. He needs two confirmations before signing: that the $48,000 price includes the analytics dashboard, and that you can kick off by July 22. He offered a Thursday call.',
    citations: [{ threadId: 't-acme', label: 'Q3 proposal — Acme' }],
  },
]

function ChatTab() {
  const [input, setInput] = React.useState('')
  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          {SEED_CHAT.map((m, i) => (
            <div
              key={i}
              className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm',
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-card',
                )}
              >
                {m.role === 'ai' && <AiTag className="mb-1.5" />}
                <p className={m.role === 'ai' ? 'text-muted-foreground' : ''}>{m.text}</p>
                {m.citations && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.citations.map((c) => (
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
          ))}
        </div>
      </ScrollArea>
      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2 rounded-2xl border border-input bg-card p-2 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={1}
            placeholder="Ask about your inbox…"
            className="max-h-28 min-h-6 flex-1 resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted-foreground/70"
          />
          <Button size="icon-sm" variant="ai" aria-label="Send" disabled={!input.trim()}>
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
