import * as React from 'react'
import { cn } from '../lib/utils'

/**
 * Category identity is monochrome — the label carries the meaning, not a hue.
 * A dot/chip renders neutral gray by default; pass `active` to highlight the ONE
 * focal category (e.g. the open category page) in the sparing blue accent.
 *
 * CATEGORY_CLASSES is retained for any consumer that keys off the token stem;
 * every stem now resolves to the same neutral (see theme.css `--cat-*`).
 */
export const CATEGORY_CLASSES = {
  'to-reply': { dot: 'bg-cat-to-reply', text: 'text-cat-to-reply', chip: 'bg-cat-to-reply/12 text-cat-to-reply' },
  'awaiting-reply': {
    dot: 'bg-cat-awaiting-reply',
    text: 'text-cat-awaiting-reply',
    chip: 'bg-cat-awaiting-reply/15 text-cat-awaiting-reply',
  },
  fyi: { dot: 'bg-cat-fyi', text: 'text-cat-fyi', chip: 'bg-cat-fyi/12 text-cat-fyi' },
  newsletters: { dot: 'bg-cat-newsletters', text: 'text-cat-newsletters', chip: 'bg-cat-newsletters/12 text-cat-newsletters' },
  notifications: { dot: 'bg-cat-notifications', text: 'text-cat-notifications', chip: 'bg-cat-notifications/12 text-cat-notifications' },
  promotions: { dot: 'bg-cat-promotions', text: 'text-cat-promotions', chip: 'bg-cat-promotions/12 text-cat-promotions' },
  receipts: { dot: 'bg-cat-receipts', text: 'text-cat-receipts', chip: 'bg-cat-receipts/12 text-cat-receipts' },
  calendar: { dot: 'bg-cat-calendar', text: 'text-cat-calendar', chip: 'bg-cat-calendar/12 text-cat-calendar' },
  personal: { dot: 'bg-cat-personal', text: 'text-cat-personal', chip: 'bg-cat-personal/12 text-cat-personal' },
} as const

export type CategoryToken = keyof typeof CATEGORY_CLASSES

export function CategoryDot({
  active,
  className,
}: {
  /** Retained for API compatibility; no longer drives color. */
  token?: string
  active?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-block size-2 rounded-full',
        active ? 'bg-accent' : 'bg-muted-foreground/40',
        className,
      )}
    />
  )
}

export function CategoryChip({
  label,
  icon,
  active,
  className,
}: {
  /** Retained for API compatibility; no longer drives color. */
  token?: string
  label: string
  icon?: React.ReactNode
  active?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium [&_svg]:size-3',
        active ? 'bg-accent/12 text-accent' : 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {icon}
      {label}
    </span>
  )
}

// Priority is monochrome too: urgency reads as ink weight, not color.
const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-foreground',
  high: 'bg-muted-foreground',
  normal: 'bg-muted-foreground/50',
  low: 'bg-border',
}

export function PriorityDot({ priority, className }: { priority: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block size-2 rounded-full',
        PRIORITY_DOT[priority] ?? PRIORITY_DOT.normal,
        className,
      )}
      aria-label={`${priority} priority`}
    />
  )
}
