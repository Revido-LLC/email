import { CATEGORIES, getThread, type Thread } from '@revido/mock-data'
import { AiTag, Badge, CategoryChip, ContactAvatar, PriorityDot, Sparkle, cn } from '@revido/ui'
import { Check, Sparkles, Sun, Zap } from 'lucide-react'

const MOCK_THREAD_IDS = ['t-acme', 't-priya', 't-elena']

/**
 * A stylized "Today"-style card built from the real kit — this is the hero
 * visual that sells the product. Purely illustrative, no interactivity.
 */
export function ProductMock({ className }: { className?: string }) {
  const threads = MOCK_THREAD_IDS.map(getThread).filter((t): t is Thread => Boolean(t))

  return (
    <div className={cn('relative max-w-full', className)}>
      {/* Soft glow behind the card */}
      <div
        aria-hidden
        className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-br from-primary/20 via-accent/20 to-ai/15 blur-2xl"
      />

      <div className="rotate-1 rounded-3xl border border-border bg-card p-5 shadow-pop">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              <Sun className="size-3.5 text-accent" />
              Wednesday, July 15
            </div>
            <div className="mt-0.5 font-display text-xl font-semibold tracking-tight">
              Good morning, Sam
            </div>
          </div>
          <AiTag label="Triaged" />
        </div>

        {/* Stat strip */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          <MockStat n="6" label="need you" tone="text-primary" bg="bg-primary/10" />
          <MockStat
            n="3"
            label="promises"
            tone="text-cat-awaiting-reply"
            bg="bg-cat-awaiting-reply/12"
          />
          <MockStat n="24" label="handled" tone="text-ai" bg="bg-ai/10" ai />
        </div>

        {/* Thread rows */}
        <div className="space-y-0.5 rounded-2xl border border-border bg-background/60 p-2">
          {threads.map((thread) => (
            <MockRow key={thread.id} thread={thread} />
          ))}
        </div>

        {/* Agent footer */}
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-ai/10 p-2.5">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-ai/15 text-ai">
            <Sparkles className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Agents</span> bundled 6 newsletters &amp;
            filed 2 receipts
          </span>
          <Badge variant="ai" className="shrink-0 gap-1">
            <Check className="size-3" /> done
          </Badge>
        </div>
      </div>

      {/* Floating "saved time" pill */}
      <div className="absolute -right-3 -top-4 hidden rotate-3 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 shadow-pop sm:flex">
        <Zap className="size-3.5 text-accent" />
        <span className="text-2xs font-semibold">20 min saved today</span>
      </div>

      {/* Floating drafted-reply card */}
      <div className="absolute -bottom-6 -left-4 hidden w-56 -rotate-3 rounded-2xl border border-border bg-card p-3 shadow-pop lg:block">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Sparkle className="size-3" />
          <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            Drafted in your voice
          </span>
        </div>
        <p className="text-2xs leading-relaxed text-muted-foreground">
          “Hi John — yes, the $48k includes the dashboard. Let’s lock July 22 for kickoff.”
        </p>
      </div>
    </div>
  )
}

function MockStat({
  n,
  label,
  tone,
  bg,
  ai,
}: {
  n: string
  label: string
  tone: string
  bg: string
  ai?: boolean
}) {
  return (
    <div className={cn('relative overflow-hidden rounded-xl p-2.5', bg)}>
      {ai && <Sparkle className="absolute right-1.5 top-1.5 size-3" />}
      <div className={cn('font-display text-lg font-semibold leading-none', tone)}>{n}</div>
      <div className="mt-1 text-2xs text-muted-foreground">{label}</div>
    </div>
  )
}

function MockRow({ thread }: { thread: Thread }) {
  const meta = CATEGORIES[thread.category]
  const sender = thread.participants[0]!

  return (
    <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
      <PriorityDot priority={thread.priority} className="shrink-0" />
      <ContactAvatar name={sender.name} className="size-7 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium">{sender.name}</span>
          <CategoryChip token={meta.token} label={meta.label} className="shrink-0" />
        </div>
        <div className="mt-0.5 flex items-center gap-1">
          <Sparkle className="size-3 shrink-0" />
          <span className="truncate text-2xs text-muted-foreground">{thread.tldr}</span>
        </div>
      </div>
    </div>
  )
}
