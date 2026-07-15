import * as React from 'react'
import { cn } from '../lib/utils'

/** A keyboard key hint chip, e.g. <Kbd>⌘</Kbd><Kbd>K</Kbd>. */
export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-border bg-muted px-1.5 font-sans text-2xs font-medium text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}
