import * as React from 'react'
import { cn } from '../lib/utils'

/**
 * Category color utilities, keyed by the token stem from mock-data's CategoryMeta.
 * These are written as *literal* class strings (not templated) so Tailwind's
 * scanner detects them. Keep this map in sync with theme.css category vars.
 */
export const CATEGORY_CLASSES = {
  'to-reply': {
    dot: 'bg-cat-to-reply',
    text: 'text-cat-to-reply',
    chip: 'bg-cat-to-reply/12 text-cat-to-reply',
  },
  'awaiting-reply': {
    dot: 'bg-cat-awaiting-reply',
    text: 'text-cat-awaiting-reply',
    chip: 'bg-cat-awaiting-reply/15 text-cat-awaiting-reply',
  },
  fyi: { dot: 'bg-cat-fyi', text: 'text-cat-fyi', chip: 'bg-cat-fyi/12 text-cat-fyi' },
  newsletters: {
    dot: 'bg-cat-newsletters',
    text: 'text-cat-newsletters',
    chip: 'bg-cat-newsletters/12 text-cat-newsletters',
  },
  notifications: {
    dot: 'bg-cat-notifications',
    text: 'text-cat-notifications',
    chip: 'bg-cat-notifications/12 text-cat-notifications',
  },
  promotions: {
    dot: 'bg-cat-promotions',
    text: 'text-cat-promotions',
    chip: 'bg-cat-promotions/12 text-cat-promotions',
  },
  receipts: {
    dot: 'bg-cat-receipts',
    text: 'text-cat-receipts',
    chip: 'bg-cat-receipts/12 text-cat-receipts',
  },
  calendar: {
    dot: 'bg-cat-calendar',
    text: 'text-cat-calendar',
    chip: 'bg-cat-calendar/12 text-cat-calendar',
  },
  personal: {
    dot: 'bg-cat-personal',
    text: 'text-cat-personal',
    chip: 'bg-cat-personal/12 text-cat-personal',
  },
} as const

export type CategoryToken = keyof typeof CATEGORY_CLASSES

function classesFor(token: string) {
  return CATEGORY_CLASSES[token as CategoryToken] ?? CATEGORY_CLASSES.fyi
}

export function CategoryDot({ token, className }: { token: string; className?: string }) {
  return (
    <span className={cn('inline-block size-2 rounded-full', classesFor(token).dot, className)} />
  )
}

export function CategoryChip({
  token,
  label,
  icon,
  className,
}: {
  token: string
  label: string
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium [&_svg]:size-3',
        classesFor(token).chip,
        className,
      )}
    >
      {icon}
      {label}
    </span>
  )
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-primary',
  high: 'bg-cat-awaiting-reply',
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
