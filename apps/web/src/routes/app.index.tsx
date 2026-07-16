// i18n-todo: extract hardcoded copy in this screen to the en/nl catalogs (see apps/web/src/i18n)
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  APPROVALS,
  CATEGORIES,
  COMMITMENTS,
  TODAY_BRIEF,
  getAgentRuns,
  getThread,
  type Thread,
} from '@revido/mock-data'
import {
  AiTag,
  Badge,
  Button,
  CategoryChip,
  ContactAvatar,
  PriorityDot,
  Sparkle,
  cn,
} from '@revido/ui'
import { ArrowRight, Check, ChevronRight, Clock, Inbox, Sparkles, Sun, X } from 'lucide-react'
import * as React from 'react'
import { Icon } from '@/lib/icons'

export const Route = createFileRoute('/app/')({
  component: TodayScreen,
})

function TodayScreen() {
  const brief = TODAY_BRIEF
  const needsYou = brief.needsYou.map(getThread).filter((t): t is Thread => Boolean(t))
  const runs = getAgentRuns()

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-6 lg:py-8">
        {/* Greeting */}
        <header className="mb-7 flex items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Sun className="size-4 text-accent" />
              {brief.date}
            </div>
            <h1 className="text-2xl font-semibold">{brief.greeting}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Here’s what matters today — the rest is handled.
            </p>
          </div>
        </header>

        {/* Stat strip */}
        <div className="mb-8 grid grid-cols-3 gap-3">
          <StatPill n={brief.stats.needYou} label="need you" tone="text-primary" />
          <StatPill
            n={brief.stats.promises}
            label="promises to keep"
            tone="text-cat-awaiting-reply"
          />
          <StatPill n={brief.stats.agentsHandled} label="handled by agents" tone="text-ai" ai />
        </div>

        {/* Needs You */}
        <Section
          title="Needs You"
          icon={<Inbox className="size-4" />}
          action={
            <Button asChild variant="ghost" size="sm">
              <Link to="/app/inbox">
                Open inbox <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          }
        >
          <div className="divide-y divide-border">
            {needsYou.map((t) => (
              <NeedsYouRow key={t.id} thread={t} />
            ))}
          </div>
        </Section>

        {/* Commitments */}
        <Section title="Your Commitments" icon={<Clock className="size-4" />} marked>
          <div className="space-y-2.5">
            {COMMITMENTS.map((com) => (
              <div key={com.id} className="flex items-start gap-3 rounded-xl bg-muted/50 p-3">
                <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-cat-awaiting-reply/15 text-cat-awaiting-reply">
                  <Clock className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{com.text}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {com.counterpart} · {com.subject}
                  </p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to="/app/thread/$threadId" params={{ threadId: com.threadId }}>
                    Open
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        </Section>

        {/* Agent Report */}
        <Section title="Agent Report" icon={<Sparkles className="size-4 text-ai" />} marked>
          <div className="space-y-2.5">
            {runs.map((run) =>
              run.status === 'pending-approval' ? (
                <InlineApproval key={run.id} runId={run.id} />
              ) : (
                <div
                  key={run.id}
                  className="flex items-start gap-3 rounded-xl border border-border p-3"
                >
                  <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-ai/10 text-ai">
                    <Icon name={run.agentIcon} className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{run.agentName}</span>
                      <Badge variant="ai" className="gap-1">
                        <Check className="size-3" /> done
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{run.summary}</p>
                  </div>
                </div>
              ),
            )}
          </div>
        </Section>

        {/* Can Ignore */}
        <Section title="Can Ignore" icon={<ChevronRight className="size-4" />}>
          <div className="flex flex-wrap gap-2">
            {brief.canIgnore.map((bundle) => {
              const meta = CATEGORIES[bundle.category]
              return (
                <div
                  key={bundle.category}
                  className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2"
                >
                  <CategoryChip token={meta.token} label={meta.label} />
                  <span className="text-sm text-muted-foreground">{bundle.count} bundled</span>
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Newsletters, notifications and promos — batched into your digest so they don’t
            interrupt.
          </p>
        </Section>

        {/* Revido CTA footer */}
        <RevidoFooter line={brief.revidoCta} />
      </div>
    </div>
  )
}

function StatPill({
  n,
  label,
  tone,
  ai,
}: {
  n: number
  label: string
  tone: string
  ai?: boolean
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-subtle p-4">
      {ai && <Sparkle className="absolute right-3 top-3" />}
      <div className={cn('text-2xl font-semibold tabular-nums', tone)}>{n}</div>
      <div className="mt-0.5 text-sm text-muted-foreground">{label}</div>
    </div>
  )
}

function Section({
  title,
  icon,
  action,
  marked,
  children,
}: {
  title: string
  icon?: React.ReactNode
  action?: React.ReactNode
  marked?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="mb-6 rounded-2xl border border-border bg-card shadow-soft">
      <div className="flex items-center justify-between px-5 pt-4">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {marked && <AiTag />}
        </div>
        {action}
      </div>
      <div className="p-5 pt-3">{children}</div>
    </section>
  )
}

function NeedsYouRow({ thread }: { thread: Thread }) {
  const meta = CATEGORIES[thread.category]
  const sender =
    thread.participants.find((p) => p.email !== 'sam@brightfoundry.co') ?? thread.participants[0]!
  return (
    <Link
      to="/app/thread/$threadId"
      params={{ threadId: thread.id }}
      className="group flex items-center gap-3 py-3 first:pt-0 last:pb-0"
    >
      <PriorityDot priority={thread.priority} className="shrink-0" />
      <ContactAvatar name={sender.name} className="size-8 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{sender.name}</span>
          <CategoryChip token={meta.token} label={meta.label} className="shrink-0" />
        </div>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">{thread.tldr}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {thread.badges.slice(0, 2).map((b, i) => (
          <Badge key={i} variant="outline" className="hidden sm:inline-flex">
            {b.label}
          </Badge>
        ))}
        <ChevronRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </Link>
  )
}

function InlineApproval({ runId }: { runId: string }) {
  const run = getAgentRuns().find((r) => r.id === runId)
  const approval = APPROVALS.find((a) => a.agentId === run?.agentId) ?? APPROVALS[0]!
  const [resolved, setResolved] = React.useState<null | 'approved' | 'rejected'>(null)

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <Icon name={approval.agentIcon} className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{approval.agentName}</span>
            <Badge variant="warning" className="gap-1">
              <Clock className="size-3" /> needs approval
            </Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {approval.action} — <span className="text-foreground">{approval.subject}</span>
          </p>
          <div className="mt-2 rounded-lg bg-card p-2.5 text-sm text-muted-foreground">
            <div className="mb-1 flex items-center gap-1.5">
              <Sparkle className="size-3" />
              <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground/70">
                Drafted for you
              </span>
            </div>
            {approval.preview}
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-2 pl-10">
        {resolved ? (
          <span className="text-sm font-medium text-muted-foreground">
            {resolved === 'approved' ? '✓ Approved — sending' : '✕ Rejected'}
          </span>
        ) : (
          <>
            <Button size="sm" onClick={() => setResolved('approved')}>
              <Check className="size-3.5" /> Approve
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setResolved('rejected')}>
              <X className="size-3.5" /> Reject
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function RevidoFooter({ line }: { line: string }) {
  return (
    <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-border bg-subtle p-6 text-center">
      <p className="max-w-md text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{line}</span>
      </p>
      <Button asChild variant="primary" size="sm">
        <Link to="/talk">
          Talk to Revido <ArrowRight className="size-3.5" />
        </Link>
      </Button>
      <p className="text-2xs text-muted-foreground/60">
        Built by Revido · we build custom AI tools
      </p>
    </div>
  )
}
