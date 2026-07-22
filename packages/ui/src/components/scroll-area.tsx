import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'
import * as React from 'react'
import { cn } from '../lib/utils'

export const ScrollArea = React.forwardRef<
  React.ComponentRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn('relative overflow-hidden', className)}
    {...props}
  >
    {/*
      Radix wraps children in a `display:table; min-width:100%` div (inline style)
      so horizontal-scroll content can shrink-wrap. But `display:table` also grows
      to fit any `white-space:nowrap`/`truncate` descendant — so a long, unbroken
      line blows the viewport past its container instead of truncating (the AI
      panel / nav / dialogs all scroll vertically only). Force that wrapper back to
      `block` (`!` beats Radix's inline style) so content clamps to the width and
      truncation works. All ScrollAreas here are vertical, so this is always right.
    */}
    <ScrollAreaPrimitive.Viewport className="size-full rounded-[inherit] [&>div]:!block">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
))
ScrollArea.displayName = 'ScrollArea'

export const ScrollBar = React.forwardRef<
  React.ComponentRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = 'vertical', ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      'flex touch-none select-none transition-colors',
      orientation === 'vertical' && 'h-full w-2 border-l border-l-transparent p-0.5',
      orientation === 'horizontal' && 'h-2 flex-col border-t border-t-transparent p-0.5',
      className,
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = 'ScrollBar'
