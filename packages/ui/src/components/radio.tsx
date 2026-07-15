import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { Circle } from 'lucide-react'
import * as React from 'react'
import { cn } from '../lib/utils'

export const RadioGroup = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Root ref={ref} className={cn('grid gap-2', className)} {...props} />
))
RadioGroup.displayName = 'RadioGroup'

export const RadioGroupItem = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      'peer size-4 shrink-0 rounded-full border border-input bg-card text-primary transition-colors',
      'hover:border-ring active:border-primary',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:border-primary',
      // Error state — set `aria-invalid` on the item (or spread from the group).
      'aria-invalid:border-destructive aria-invalid:text-destructive',
      'aria-invalid:focus-visible:ring-destructive/40 aria-invalid:data-[state=checked]:border-destructive',
      className,
    )}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
      <Circle className="size-2 fill-current text-current" />
    </RadioGroupPrimitive.Indicator>
  </RadioGroupPrimitive.Item>
))
RadioGroupItem.displayName = 'RadioGroupItem'
