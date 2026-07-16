// i18n-todo: extract hardcoded copy in this component to the en/nl catalogs (see apps/web/src/i18n)
import { Link } from '@tanstack/react-router'
import { CATEGORIES, USER, type Thread, type ThreadBadge } from '@revido/mock-data'
import {
  Badge,
  Button,
  CategoryChip,
  Checkbox,
  ContactAvatar,
  PriorityDot,
  SimpleTooltip,
  cn,
} from '@revido/ui'
import {
  Archive,
  Bell,
  Calendar,
  Clock,
  DollarSign,
  Paperclip,
  Sparkles,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import * as React from 'react'

const BADGE_ICON: Record<ThreadBadge['kind'], LucideIcon> = {
  attachment: Paperclip,
  amount: DollarSign,
  date: Calendar,
  tracking: Truck,
  people: Users,
}

/** today → "8:12 AM"; otherwise → "Jul 14". */
function formatRowTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

interface ThreadRowProps {
  thread: Thread
  focused: boolean
  selected: boolean
  selectMode: boolean
  onToggleSelect: (id: string) => void
  onArchive: (id: string) => void
  onSnooze: (id: string) => void
  onHover: () => void
  innerRef?: (el: HTMLDivElement | null) => void
}

export function ThreadRow({
  thread,
  focused,
  selected,
  selectMode,
  onToggleSelect,
  onArchive,
  onSnooze,
  onHover,
  innerRef,
}: ThreadRowProps) {
  const meta = CATEGORIES[thread.category]
  const sender = thread.participants.find((p) => p.email !== USER.email) ?? thread.participants[0]!
  const showBox = selectMode || selected

  return (
    <div
      ref={innerRef}
      onMouseEnter={onHover}
      className={cn(
        'group relative flex items-center gap-2 rounded-xl px-2 py-2.5 transition-colors sm:gap-3 sm:px-3',
        focused ? 'bg-muted ring-1 ring-inset ring-border' : 'hover:bg-muted/60',
      )}
    >
      {/* Stretched click target — non-interactive content lets clicks fall through to it. */}
      <Link
        to="/app/thread/$threadId"
        params={{ threadId: thread.id }}
        aria-label={`Open: ${thread.subject}`}
        className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />

      {/* Priority dot ⇄ checkbox */}
      <div className="pointer-events-none relative flex size-5 shrink-0 items-center justify-center">
        <PriorityDot
          priority={thread.priority}
          className={cn('transition-opacity', showBox ? 'opacity-0' : 'group-hover:opacity-0')}
        />
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(thread.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select thread"
          className={cn(
            'absolute z-10 transition-opacity',
            showBox
              ? 'pointer-events-auto opacity-100'
              : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100',
          )}
        />
      </div>

      <ContactAvatar
        name={sender.name}
        src={sender.avatarUrl}
        className="pointer-events-none size-8 shrink-0"
      />

      {/* Sender · subject + AI TL;DR */}
      <div className="pointer-events-none min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {thread.unread && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
          <span
            className={cn(
              'min-w-0 truncate text-sm sm:shrink-0',
              thread.unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/90',
            )}
          >
            {sender.name}
          </span>
          <span className="truncate text-sm text-muted-foreground">{thread.subject}</span>
        </div>
        <div className="mt-0.5">
          <span className="truncate text-sm text-muted-foreground">{thread.tldr}</span>
        </div>
      </div>

      {/* Right cluster: badges · chip · time ⇄ quick actions */}
      <div className="pointer-events-none relative z-10 flex shrink-0 items-center gap-2">
        <div className="hidden items-center gap-1.5 md:flex">
          {thread.badges.slice(0, 2).map((b, i) => {
            const BadgeIcon = BADGE_ICON[b.kind]
            return (
              <Badge key={i} variant="outline" className="font-normal">
                <BadgeIcon className="size-3" />
                {b.label}
              </Badge>
            )
          })}
        </div>

        <CategoryChip
          token={meta.token}
          label={meta.label}
          className="hidden shrink-0 sm:inline-flex"
        />

        {/* time under, actions over */}
        <div className="relative flex w-16 items-center justify-end">
          <span className="text-xs tabular-nums text-muted-foreground transition-opacity group-hover:opacity-0">
            {formatRowTime(thread.lastMessageAt)}
          </span>
          <div className="absolute right-0 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <RowAction label="Archive · e" onClick={() => onArchive(thread.id)}>
              <Archive />
            </RowAction>
            <RowAction label="Snooze · h" onClick={() => onSnooze(thread.id)}>
              <Clock />
            </RowAction>
            <RowAction label="Remind me">
              <Bell />
            </RowAction>
            <RowAction label="AI reply" ai>
              <Sparkles className="text-ai" />
            </RowAction>
          </div>
        </div>
      </div>
    </div>
  )
}

function RowAction({
  label,
  onClick,
  ai,
  children,
}: {
  label: string
  onClick?: () => void
  ai?: boolean
  children: React.ReactNode
}) {
  return (
    <SimpleTooltip label={label}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onClick?.()
        }}
        className={cn(
          'pointer-events-auto size-7 text-muted-foreground',
          ai ? 'hover:text-ai' : 'hover:text-foreground',
        )}
      >
        {children}
      </Button>
    </SimpleTooltip>
  )
}
