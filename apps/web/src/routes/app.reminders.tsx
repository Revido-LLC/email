// i18n-todo: extract hardcoded copy in this screen to the en/nl catalogs (see apps/web/src/i18n)
import { Link, createFileRoute } from '@tanstack/react-router'
import { getReminders, type Reminder, type ReminderKind } from '@revido/mock-data'
import { AiTag, Badge, Button, Sparkle, cn } from '@revido/ui'
import { AlarmClock, Bell, ChevronRight, Clock, Moon, Send } from 'lucide-react'
import * as React from 'react'

export const Route = createFileRoute('/app/reminders')({
  component: RemindersScreen,
})

/** Anchor "now" to the mock timeline so relative dates stay believable. */
const NOW = new Date('2026-07-15T09:00:00Z')

const GROUPS: {
  kind: ReminderKind
  title: string
  blurb: string
  token: string
  icon: React.ReactNode
}[] = [
  {
    kind: 'follow-up',
    title: 'Follow-ups',
    blurb: 'People who owe you a reply — nudge them in one tap.',
    token: 'awaiting-reply',
    icon: <Send className="size-4" />,
  },
  {
    kind: 'deadline',
    title: 'Deadlines',
    blurb: 'Promises and dates you don’t want to let slip.',
    token: 'to-reply',
    icon: <AlarmClock className="size-4" />,
  },
  {
    kind: 'snoozed',
    title: 'Snoozed',
    blurb: 'Tucked away until you’re ready for them.',
    token: 'newsletters',
    icon: <Moon className="size-4" />,
  },
]

function RemindersScreen() {
  const reminders = getReminders()

  return (
    <div className="h-full overflow-y-auto">
      <header className="glass-thin sticky top-0 z-10 border-x-0 border-t-0">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <Bell className="size-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Reminders</h1>
            <p className="text-sm text-muted-foreground">
              Nothing falls through — follow-ups, deadlines and snoozed threads in one place.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="space-y-6">
          {GROUPS.map((group) => {
            const items = reminders.filter((r) => r.kind === group.kind)
            return <ReminderGroup key={group.kind} group={group} items={items} />
          })}
        </div>
      </div>
    </div>
  )
}

function ReminderGroup({ group, items }: { group: (typeof GROUPS)[number]; items: Reminder[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card shadow-soft">
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <div className="flex items-center gap-2">
          <span className={chipText(group.token)}>{group.icon}</span>
          <h2 className="text-lg font-semibold">{group.title}</h2>
          <Badge variant="outline">{items.length}</Badge>
        </div>
      </div>
      <p className="px-5 pt-1 text-sm text-muted-foreground">{group.blurb}</p>
      <div className="p-5 pt-3">
        {items.length === 0 ? (
          <p className="rounded-xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
            All clear here.
          </p>
        ) : (
          <div className="space-y-2.5">
            {items.map((r) => (
              <ReminderRow key={r.id} reminder={r} token={group.token} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function ReminderRow({ reminder, token }: { reminder: Reminder; token: string }) {
  const due = formatDue(reminder.dueAt)
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <Link
        to="/app/thread/$threadId"
        params={{ threadId: reminder.threadId }}
        className="group flex items-start gap-3"
      >
        <div
          className={cn(
            'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4',
            chipBg(token),
            chipText(token),
          )}
        >
          <ReminderIcon kind={reminder.kind} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{reminder.subject}</span>
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{reminder.context}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">{reminder.sender}</span>
            <span className="text-muted-foreground/50">·</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {due.absolute}
            </span>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-1.5 py-0.5 text-2xs font-medium',
                due.overdue
                  ? 'bg-destructive/12 text-destructive'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {due.relative}
            </span>
          </div>
        </div>
        <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>

      {reminder.draftReply && <ChaserBlock draft={reminder.draftReply} />}
    </div>
  )
}

function ChaserBlock({ draft }: { draft: string }) {
  const [resolved, setResolved] = React.useState<null | 'sent' | 'snoozed'>(null)

  return (
    <div className="mt-2.5 ml-11 rounded-xl border border-ai/25 bg-ai/5 p-3">
      <div className="mb-1.5 flex items-center gap-1.5">
        <AiTag label="Drafted chaser" />
      </div>
      <p className="text-sm text-muted-foreground">{draft}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {resolved ? (
          <span className="text-sm font-medium text-muted-foreground">
            {resolved === 'sent' ? '✓ Chaser sent' : '✓ Snoozed for later'}
          </span>
        ) : (
          <>
            <Button size="sm" variant="ai" onClick={() => setResolved('sent')}>
              <Sparkle className="text-ai-foreground" /> Send chaser
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setResolved('snoozed')}>
              <Moon className="size-3.5" /> Snooze
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function ReminderIcon({ kind }: { kind: ReminderKind }) {
  if (kind === 'follow-up') return <Send />
  if (kind === 'deadline') return <AlarmClock />
  return <Moon />
}

function formatDue(iso: string) {
  const due = new Date(iso)
  const absolute = `Due ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  const days = Math.round((startOfDay(due) - startOfDay(NOW)) / 86_400_000)
  let relative: string
  if (days === 0) relative = 'today'
  else if (days === 1) relative = 'tomorrow'
  else if (days > 1) relative = `in ${days} days`
  else if (days === -1) relative = 'yesterday'
  else relative = `${Math.abs(days)} days ago`
  return { absolute, relative, overdue: days < 0 }
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

// Literal class strings so Tailwind's scanner keeps them.
function chipBg(token: string) {
  switch (token) {
    case 'to-reply':
      return 'bg-cat-to-reply/12'
    case 'awaiting-reply':
      return 'bg-cat-awaiting-reply/15'
    case 'newsletters':
      return 'bg-cat-newsletters/12'
    default:
      return 'bg-cat-fyi/12'
  }
}

function chipText(token: string) {
  switch (token) {
    case 'to-reply':
      return 'text-cat-to-reply'
    case 'awaiting-reply':
      return 'text-cat-awaiting-reply'
    case 'newsletters':
      return 'text-cat-newsletters'
    default:
      return 'text-cat-fyi'
  }
}
