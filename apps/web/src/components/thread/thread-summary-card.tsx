import { type ExtractedFact, type Thread } from '@revido/mock-data'
import { AiTag, Button, Checkbox, Sparkle } from '@revido/ui'
import { Calendar, ChevronDown, CircleDollarSign, Link2, Truck, User } from 'lucide-react'
import * as React from 'react'

const factIcon: Record<ExtractedFact['type'], React.ReactNode> = {
  date: <Calendar className="size-3.5" />,
  amount: <CircleDollarSign className="size-3.5" />,
  tracking: <Truck className="size-3.5" />,
  link: <Link2 className="size-3.5" />,
  contact: <User className="size-3.5" />,
  action: <Sparkle className="size-3.5" />,
}

export function ThreadSummaryCard({ thread }: { thread: Thread }) {
  const [open, setOpen] = React.useState(true)
  const actions = thread.extracted.filter((f) => f.type === 'action')
  const facts = thread.extracted.filter((f) => f.type !== 'action')
  const hasDetails = actions.length > 0 || facts.length > 0

  return (
    <section className="overflow-hidden rounded-2xl border border-ai/20 bg-ai/5 shadow-soft">
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-ai/12">
          <Sparkle />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <h2 className="text-sm font-semibold">Summary</h2>
            <AiTag />
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{thread.summary}</p>
        </div>
        {hasDetails && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Collapse summary details' : 'Expand summary details'}
          >
            <ChevronDown className={`size-4 transition-transform ${open ? '' : '-rotate-90'}`} />
          </Button>
        )}
      </div>

      {hasDetails && open && (
        <div className="space-y-4 px-4 pb-4">
          {actions.length > 0 && (
            <div>
              <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                Action items
              </div>
              <div className="space-y-2">
                {actions.map((a, i) => (
                  <label key={i} className="flex items-start gap-2.5 text-sm">
                    <Checkbox defaultChecked={a.done} className="mt-0.5" />
                    <span className="text-foreground/90">{a.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {facts.length > 0 && (
            <div>
              <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                Extracted
              </div>
              <div className="flex flex-wrap gap-1.5">
                {facts.map((f, i) => (
                  <span
                    key={i}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
                  >
                    {factIcon[f.type]}
                    <span className="shrink-0 text-muted-foreground">{f.label}:</span>
                    <span className="truncate font-medium">{f.value}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
