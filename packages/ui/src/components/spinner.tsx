import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '../lib/utils'

const spinnerVariants = cva('animate-spin', {
  variants: {
    size: {
      sm: 'size-4',
      md: 'size-6',
      lg: 'size-8',
    },
  },
  defaultVariants: { size: 'md' },
})

export interface SpinnerProps
  extends React.SVGAttributes<SVGSVGElement>,
    VariantProps<typeof spinnerVariants> {
  /** Accessible label announced to assistive tech. Defaults to "Loading". */
  label?: string
}

/**
 * Dependency-free loading spinner. Strokes with `currentColor`, so it inherits the
 * surrounding text color and reads on any background — set the color with `text-*`.
 */
export const Spinner = React.forwardRef<SVGSVGElement, SpinnerProps>(
  ({ className, size, label = 'Loading', ...props }, ref) => (
    <svg
      ref={ref}
      role="status"
      aria-label={label}
      viewBox="0 0 24 24"
      fill="none"
      className={cn(spinnerVariants({ size }), className)}
      {...props}
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  ),
)
Spinner.displayName = 'Spinner'

export { spinnerVariants }
