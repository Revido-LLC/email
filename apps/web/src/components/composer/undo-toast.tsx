// i18n-todo: extract hardcoded copy in this component to the en/nl catalogs (see apps/web/src/i18n)
import { RotateCcw, Send } from 'lucide-react'
import * as React from 'react'
import { Button, Progress } from '@revido/ui'

/**
 * The "Undo Send" toast. Counts down from `seconds`; if it reaches zero the
 * message resolves as sent (`onComplete`), otherwise "Undo" cancels (`onUndo`).
 */
export function UndoToast({
  seconds = 10,
  onUndo,
  onComplete,
}: {
  seconds?: number
  onUndo: () => void
  onComplete: () => void
}) {
  const [remaining, setRemaining] = React.useState(seconds)

  React.useEffect(() => {
    if (remaining <= 0) {
      onComplete()
      return
    }
    const t = window.setTimeout(() => setRemaining((r) => r - 1), 1000)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining])

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-border bg-popover p-3 pl-4 text-popover-foreground shadow-pop animate-in fade-in-0 slide-in-from-bottom-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
          <Send className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Sending your message…</p>
          <div className="mt-1.5 flex items-center gap-2">
            <Progress value={remaining / seconds} className="h-1.5 flex-1" />
            <span className="w-6 text-right text-sm font-semibold tabular-nums text-muted-foreground">
              {remaining}s
            </span>
          </div>
        </div>
        <Button size="sm" variant="secondary" onClick={onUndo} className="shrink-0">
          <RotateCcw className="size-3.5" /> Undo
        </Button>
      </div>
    </div>
  )
}
