// i18n-todo: extract hardcoded copy in this component to the en/nl catalogs (see apps/web/src/i18n)
import type { AgentRunEntry } from '@revido/db'
import { AiTag, Badge, Button, cn } from '@revido/ui'
import { Link } from '@tanstack/react-router'
import { Check, ChevronDown, Clock, CornerUpLeft, Loader2, Mail, RotateCcw } from 'lucide-react'
import * as React from 'react'
import { Icon } from '@/lib/icons'
import { useAgentRuns, useUndoAgentRun } from '@/lib/hooks'

const TODAY = '2026-07-15'
const YESTERDAY = '2026-07-14'

function dayLabel(iso: string): string {
  const date = iso.slice(0, 10)
  if (date === TODAY) return 'Today'
  if (date === YESTERDAY) return 'Yesterday'
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function clock(iso: string): string {
  const m = iso.match(/T(\d{2}):(\d{2})/)
  if (!m) return ''
  let h = parseInt(m[1]!, 10)
  const min = m[2]
  const ap = h < 12 ? 'AM' : 'PM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${min} ${ap}`
}

export function ActivityFeed() {
  const { data, isPending } = useAgentRuns()
  const undoRun = useUndoAgentRun()
  const runs = React.useMemo(() => data ?? [], [data])
  const [reversed, setReversed] = React.useState<Set<string>>(new Set())

  const groups = React.useMemo(() => {
    const map = new Map<string, AgentRunEntry[]>()
    for (const run of runs) {
      const key = run.at.slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(run)
    }
    return [...map.entries()].map(([date, entries]) => ({ date, entries }))
  }, [runs])

  const handled = runs
    .filter((r) => r.status !== 'pending-approval')
    .reduce((n, r) => n + r.affected.length, 0)

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 rounded-2xl border border-ai/20 bg-ai/5 p-4">
        <div className="flex size-10 items-center justify-center rounded-xl bg-ai/12 text-ai">
          <Mail className="size-5" />
        </div>
        <div>
          <p className="text-sm">
            <span className="font-semibold">{handled} emails</span> handled while you were away.
          </p>
          <p className="text-xs text-muted-foreground">Every action is explained and reversible.</p>
        </div>
      </div>

      {groups.map((group) => (
        <div key={group.date}>
          <div className="mb-2.5 flex items-center gap-2">
            <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              {dayLabel(group.date + 'T00:00:00Z')}
            </h3>
            <span className="h-px flex-1 bg-border" />
            <span className="text-2xs text-muted-foreground">{group.entries.length} runs</span>
          </div>
          <div className="space-y-2.5">
            {group.entries.map((run) => (
              <ActivityEntry
                key={run.id}
                run={run}
                reversed={reversed.has(run.id)}
                onUndo={() => {
                  setReversed((prev) => new Set(prev).add(run.id))
                  undoRun.mutate(run.id)
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ActivityEntry({
  run,
  reversed,
  onUndo,
}: {
  run: AgentRunEntry
  reversed: boolean
  onUndo: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const status = reversed ? 'reversed' : run.status

  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-card shadow-soft transition-colors',
        status === 'pending-approval' && 'border-primary/30 bg-primary/5',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 p-3.5 text-left"
      >
        <div
          className={cn(
            'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
            status === 'pending-approval' ? 'bg-primary/12 text-primary' : 'bg-ai/10 text-ai',
          )}
        >
          <Icon name={run.agentIcon} className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{run.agentName}</span>
            <StatusBadge status={status} />
            <span className="ml-auto shrink-0 text-2xs text-muted-foreground">{clock(run.at)}</span>
          </div>
          <p className={cn('mt-0.5 text-sm text-muted-foreground', reversed && 'line-through')}>
            {run.summary}
          </p>
        </div>
        <ChevronDown
          className={cn(
            'mt-1 size-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div className="space-y-3 px-3.5 pb-3.5 pl-14">
          <div className="rounded-xl bg-ai/10 p-3">
            <div className="mb-1 flex items-center gap-1.5">
              <AiTag label="Reasoning" />
            </div>
            <p className="text-sm text-muted-foreground">{run.reasoning}</p>
          </div>

          <div>
            <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              {run.affected.length} {run.affected.length === 1 ? 'email' : 'emails'} affected
            </p>
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="divide-y divide-border">
                {run.affected.map((a) => (
                  <Link
                    key={a.threadId}
                    to="/app/thread/$threadId"
                    params={{ threadId: a.threadId }}
                    className="group flex items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{a.subject}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.sender}</p>
                    </div>
                    <CornerUpLeft className="size-3.5 shrink-0 -scale-x-100 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {status === 'pending-approval' ? (
              <Button asChild size="sm">
                <Link to="/app/approvals">Review in Approvals</Link>
              </Button>
            ) : reversed ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <RotateCcw className="size-3.5" /> Reversed — inbox restored
              </span>
            ) : run.reversible ? (
              <Button size="sm" variant="outline" onClick={onUndo}>
                <RotateCcw /> Undo
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">This action can’t be undone.</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: AgentRunEntry['status'] | 'reversed' }) {
  if (status === 'pending-approval') {
    return (
      <Badge variant="warning" className="gap-1">
        <Clock /> Needs approval
      </Badge>
    )
  }
  if (status === 'reversed') {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <RotateCcw /> Reversed
      </Badge>
    )
  }
  return (
    <Badge variant="ai" className="gap-1">
      <Check /> Done
    </Badge>
  )
}
