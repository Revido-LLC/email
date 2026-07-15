import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'
import * as React from 'react'
import { cn } from '../lib/utils'

/**
 * A user-managed keyword chip — distinct from Badge (a passive status label).
 * A Tag is interactive: it can be selected (toggled) and/or removed. Quiet by
 * default; pass `variant="accent"` for the sparing blue-accent treatment.
 */
const tagVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors [&_svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-secondary text-secondary-foreground',
        accent: 'border-transparent bg-accent/12 text-accent',
      },
      selected: { true: '', false: '' },
    },
    compoundVariants: [
      { variant: 'default', selected: false, className: 'hover:bg-muted' },
      {
        variant: 'default',
        selected: true,
        className: 'bg-primary text-primary-foreground hover:brightness-105',
      },
      { variant: 'accent', selected: false, className: 'hover:bg-accent/20' },
      {
        variant: 'accent',
        selected: true,
        className: 'bg-accent text-accent-foreground hover:brightness-105',
      },
    ],
    defaultVariants: { variant: 'default', selected: false },
  },
)

export interface TagProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'onClick'>,
    VariantProps<typeof tagVariants> {
  disabled?: boolean
  /** When provided, the tag body becomes a toggle button (click to select). */
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  /** When provided, a trailing remove (×) button is rendered. */
  onRemove?: React.MouseEventHandler<HTMLButtonElement>
}

export const Tag = React.forwardRef<HTMLSpanElement, TagProps>(
  ({ className, variant, selected, disabled, onClick, onRemove, children, ...props }, ref) => (
    <span
      ref={ref}
      data-selected={selected ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      className={cn(
        tagVariants({ variant, selected }),
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
      {...props}
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-pressed={selected ?? undefined}
          className={cn(
            'inline-flex cursor-pointer items-center gap-1 rounded-full outline-none',
            'focus-visible:ring-2 focus-visible:ring-ring/60',
            'active:scale-95',
            'disabled:cursor-not-allowed',
          )}
        >
          {children}
        </button>
      ) : (
        children
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label="Remove"
          className={cn(
            'inline-flex size-4 cursor-pointer items-center justify-center rounded-full text-current/70 outline-none transition-colors',
            'hover:bg-foreground/10 hover:text-current',
            'focus-visible:ring-2 focus-visible:ring-ring/60',
            'active:scale-90',
            'disabled:cursor-not-allowed',
          )}
        >
          <X />
        </button>
      )}
    </span>
  ),
)
Tag.displayName = 'Tag'

export { tagVariants }
