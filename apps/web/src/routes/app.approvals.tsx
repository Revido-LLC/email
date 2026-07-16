// i18n-todo: extract hardcoded copy in this screen to the en/nl catalogs (see apps/web/src/i18n)
import { APPROVALS, type Approval } from '@revido/mock-data'
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Kbd,
  cn,
} from '@revido/ui'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Check, ChevronDown, PartyPopper, ShieldCheck, X } from 'lucide-react'
import * as React from 'react'
import { ApprovalCard } from '@/components/agents/approval-card'
import { Icon } from '@/lib/icons'

export const Route = createFileRoute('/app/approvals')({
  component: ApprovalsScreen,
})

type Outcome = 'approved' | 'edited' | 'rejected'
interface HistoryEntry {
  id: string
  agentName: string
  action: string
  outcome: Outcome
}

function ApprovalsScreen() {
  const [queue, setQueue] = React.useState<Approval[]>(() => APPROVALS)
  const [history, setHistory] = React.useState<HistoryEntry[]>([])
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editText, setEditText] = React.useState('')

  const top = queue[0]

  const resolve = React.useCallback((appr: Approval, outcome: Outcome) => {
    setHistory((prev) => [
      { id: appr.id, agentName: appr.agentName, action: appr.action, outcome },
      ...prev,
    ])
    setQueue((prev) => prev.filter((a) => a.id !== appr.id))
    setEditingId((cur) => (cur === appr.id ? null : cur))
  }, [])

  const batchApprove = React.useCallback((agentId: string) => {
    setQueue((prev) => {
      const doomed = prev.filter((a) => a.agentId === agentId)
      if (doomed.length) {
        setHistory((h) => [
          ...doomed.map((a) => ({
            id: a.id,
            agentName: a.agentName,
            action: a.action,
            outcome: 'approved' as Outcome,
          })),
          ...h,
        ])
      }
      return prev.filter((a) => a.agentId !== agentId)
    })
  }, [])

  // Keyboard: a / x / e act on the focused (top) card. Ignored while typing.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!top) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target
      if (
        el instanceof HTMLElement &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      ) {
        return
      }
      const k = e.key.toLowerCase()
      if (k === 'a') {
        e.preventDefault()
        resolve(top, 'approved')
      } else if (k === 'x') {
        e.preventDefault()
        resolve(top, 'rejected')
      } else if (k === 'e') {
        e.preventDefault()
        setEditingId(top.id)
        setEditText(top.preview)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [top, resolve])

  const byAgent = React.useMemo(() => {
    const map = new Map<string, { name: string; icon: string; count: number }>()
    for (const a of queue) {
      const cur = map.get(a.agentId)
      if (cur) cur.count += 1
      else map.set(a.agentId, { name: a.agentName, icon: a.agentIcon, count: 1 })
    }
    return [...map.entries()]
  }, [queue])

  const approvedCount = history.filter((h) => h.outcome !== 'rejected').length
  const rejectedCount = history.filter((h) => h.outcome === 'rejected').length

  return (
    <div className="h-full overflow-y-auto">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">Approvals</h1>
              {queue.length > 0 && <Badge variant="primary">{queue.length} waiting</Badge>}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Consequential actions your agents drafted — you have the final say.
            </p>
          </div>

          {byAgent.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Check /> Batch approve <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuLabel>Approve all from…</DropdownMenuLabel>
                {byAgent.map(([agentId, meta]) => (
                  <DropdownMenuItem key={agentId} onSelect={() => batchApprove(agentId)}>
                    <Icon name={meta.icon} />
                    <span className="flex-1">{meta.name}</span>
                    <span className="text-2xs text-muted-foreground">{meta.count}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    for (const [agentId] of byAgent) batchApprove(agentId)
                  }}
                >
                  <ShieldCheck /> Approve everything
                  <span className="ml-auto text-2xs text-muted-foreground">{queue.length}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        {top ? (
          <>
            <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">1</span> of {queue.length} · from{' '}
                {top.agentName}
              </span>
              <span className="hidden items-center gap-1.5 sm:flex">
                <Kbd>A</Kbd> approve <Kbd>E</Kbd> edit <Kbd>X</Kbd> reject
              </span>
            </div>

            {/* Card stack with peeking ghosts behind the focused card */}
            <div className="relative">
              {queue.length > 2 && (
                <div className="absolute inset-x-6 -top-3 h-20 rounded-2xl border border-border bg-card/60 shadow-soft" />
              )}
              {queue.length > 1 && (
                <div className="absolute inset-x-3 -top-1.5 h-24 rounded-2xl border border-border bg-card/80 shadow-soft" />
              )}
              <div className="relative">
                <ApprovalCard
                  key={top.id}
                  approval={top}
                  editing={editingId === top.id}
                  editText={editText}
                  onEditChange={setEditText}
                  onStartEdit={() => {
                    setEditingId(top.id)
                    setEditText(top.preview)
                  }}
                  onCancelEdit={() => setEditingId(null)}
                  onConfirmEdit={() => resolve(top, 'edited')}
                  onApprove={() => resolve(top, 'approved')}
                  onReject={() => resolve(top, 'rejected')}
                />
              </div>
            </div>

            {history.length > 0 && (
              <ResolvedStrip approved={approvedCount} rejected={rejectedCount} />
            )}
          </>
        ) : (
          <div className="animate-in fade-in-0 zoom-in-95">
            <div className="rounded-2xl border border-border bg-subtle shadow-soft">
              <EmptyState
                icon={<PartyPopper />}
                title="All caught up"
                description="Your agents are waiting for the next thing. Nothing needs your sign-off right now."
                action={
                  <Button asChild variant="outline">
                    <Link to="/app/agents">See what your agents are doing</Link>
                  </Button>
                }
              />
            </div>
            {history.length > 0 && (
              <div className="mt-4">
                <ResolvedStrip approved={approvedCount} rejected={rejectedCount} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ResolvedStrip({ approved, rejected }: { approved: number; rejected: number }) {
  return (
    <div className="mt-5 flex items-center justify-center gap-4 rounded-2xl bg-muted/50 px-4 py-3 text-sm">
      <span className="flex items-center gap-1.5">
        <span className="flex size-5 items-center justify-center rounded-full bg-success/15 text-success">
          <Check className="size-3" />
        </span>
        <span className="font-medium">{approved}</span>
        <span className="text-muted-foreground">approved</span>
      </span>
      <span className={cn('flex items-center gap-1.5', rejected === 0 && 'opacity-50')}>
        <span className="flex size-5 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <X className="size-3" />
        </span>
        <span className="font-medium">{rejected}</span>
        <span className="text-muted-foreground">rejected</span>
      </span>
    </div>
  )
}
