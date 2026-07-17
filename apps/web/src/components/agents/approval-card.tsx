// i18n-todo: extract hardcoded copy in this component to the en/nl catalogs (see apps/web/src/i18n)
import type { Approval } from '@revido/db'
import { AiTag, Badge, Button, Kbd, Textarea } from '@revido/ui'
import { Link } from '@tanstack/react-router'
import { Check, Clock, Pencil, ShieldAlert, X } from 'lucide-react'
import { Icon } from '@/lib/icons'

function consequence(a: Approval): string {
  const action = a.action.toLowerCase()
  if (action.includes('send')) return `Sends a real email to ${a.sender}.`
  if (action.includes('unsubscribe')) return `Unsubscribes you from ${a.sender}.`
  if (action.includes('forward')) return `Forwards to ${a.sender}.`
  return `Runs “${a.action}” for real.`
}

export function ApprovalCard({
  approval,
  editing,
  editText,
  onEditChange,
  onStartEdit,
  onCancelEdit,
  onConfirmEdit,
  onApprove,
  onReject,
}: {
  approval: Approval
  editing: boolean
  editText: string
  onEditChange: (v: string) => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onConfirmEdit: () => void
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <div className="relative rounded-2xl border border-border bg-card p-5 shadow-soft duration-200 animate-in fade-in-0 slide-in-from-bottom-2">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
          <Icon name={approval.agentIcon} className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{approval.agentName}</span>
            <Badge variant="warning" className="gap-1">
              <Clock /> Needs approval
            </Badge>
          </div>
          <h3 className="mt-1 text-xl font-semibold tracking-tight">
            {approval.action}
          </h3>
        </div>
      </div>

      <Link
        to="/app/thread/$threadId"
        params={{ threadId: approval.threadId }}
        className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2 transition-colors hover:bg-muted"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{approval.subject}</p>
          <p className="truncate text-xs text-muted-foreground">To {approval.sender}</p>
        </div>
        <span className="shrink-0 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          Open thread
        </span>
      </Link>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between">
          <AiTag label="Drafted for you" />
          {editing && (
            <span className="text-2xs font-medium text-muted-foreground">
              Editing before sending
            </span>
          )}
        </div>
        {editing ? (
          <Textarea
            autoFocus
            value={editText}
            onChange={(e) => onEditChange(e.target.value)}
            className="min-h-32 border-ai/30 bg-ai/5"
          />
        ) : (
          <div className="rounded-xl border border-ai/20 bg-ai/5 p-3.5 text-sm leading-relaxed text-foreground/90">
            {approval.preview}
          </div>
        )}
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldAlert className="size-3.5 text-warning" />
        {consequence(approval)}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <Button onClick={onConfirmEdit}>
              <Check /> Approve edited
            </Button>
            <Button variant="ghost" onClick={onCancelEdit}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onApprove} className="gap-1.5">
              <Check /> Approve
              <Kbd className="hidden border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground sm:inline-flex">
                A
              </Kbd>
            </Button>
            <Button variant="outline" onClick={onStartEdit} className="gap-1.5">
              <Pencil /> Edit <Kbd className="hidden sm:inline-flex">E</Kbd>
            </Button>
            <Button variant="ghost" onClick={onReject} className="gap-1.5 text-muted-foreground">
              <X /> Reject <Kbd className="hidden sm:inline-flex">X</Kbd>
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
