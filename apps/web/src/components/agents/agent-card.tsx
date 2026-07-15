import { type AgentDef } from '@revido/mock-data'
import { Badge, Button, CATEGORY_CLASSES, Switch, type CategoryToken, cn } from '@revido/ui'
import { Check, Clock, Plus, Zap } from 'lucide-react'
import { Icon } from '@/lib/icons'

function accentClasses(accent: string) {
  return CATEGORY_CLASSES[accent as CategoryToken] ?? CATEGORY_CLASSES.fyi
}

export function AgentCard({
  agent,
  onToggle,
  onOpen,
  isNew,
}: {
  agent: AgentDef
  onToggle: (id: string) => void
  onOpen: (agent: AgentDef) => void
  isNew?: boolean
}) {
  const cls = accentClasses(agent.accent)
  const needsApproval = agent.actions.some((a) => a.needsApproval)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(agent)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(agent)
        }
      }}
      className={cn(
        'group flex cursor-pointer flex-col rounded-2xl border border-border bg-card p-4 text-left transition-colors',
        'hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', cls.chip)}
        >
          <Icon name={agent.icon} className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold">{agent.name}</h3>
            {isNew && <Badge variant="ai">New</Badge>}
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{agent.description}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <Zap className="text-accent" /> {agent.trigger}
        </Badge>
        {needsApproval && (
          <Badge variant="warning" className="gap-1">
            <Clock /> Asks first
          </Badge>
        )}
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-2xs text-muted-foreground">
        <span className="font-medium text-foreground">{agent.runCount}</span> runs
        <span className="text-muted-foreground/40">·</span>
        <span className="font-medium text-foreground">{agent.affectedCount}</span> handled
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Switch
            checked={agent.enabled}
            onCheckedChange={() => onToggle(agent.id)}
            aria-label={`${agent.enabled ? 'Disable' : 'Enable'} ${agent.name}`}
          />
          <span
            className={cn(
              'text-xs font-medium',
              agent.enabled ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {agent.enabled ? 'Active' : 'Off'}
          </span>
        </div>

        {agent.enabled ? (
          <Badge variant="success" className="gap-1">
            <Check /> Running
          </Badge>
        ) : (
          <Button
            size="sm"
            variant="subtle"
            onClick={(e) => {
              e.stopPropagation()
              onOpen(agent)
            }}
          >
            <Plus /> Add
          </Button>
        )}
      </div>
    </div>
  )
}
