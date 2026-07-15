import { Sparkles } from 'lucide-react'
import * as React from 'react'
import { cn } from '../lib/utils'

/**
 * The AI marker. Every AI-generated element carries this glyph — trust through
 * transparency. Use inline before AI copy, or as a small labeled tag.
 */
export function Sparkle({ className, ...props }: React.ComponentProps<typeof Sparkles>) {
  return <Sparkles className={cn('size-3.5 text-ai', className)} {...props} />
}

export function AiTag({ label = 'AI', className }: { label?: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-ai/12 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-ai',
        className,
      )}
    >
      <Sparkles className="size-3" />
      {label}
    </span>
  )
}
