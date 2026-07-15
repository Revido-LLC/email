import * as React from 'react'
import { cn } from '../lib/utils'

/**
 * Warm empty/celebration state. `icon` is typically a lucide icon or an
 * illustration blob; keep copy friendly (see empty-state spec in the plan).
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}
    >
      {icon && (
        <div className="mb-5 flex size-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground [&_svg]:size-5">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
