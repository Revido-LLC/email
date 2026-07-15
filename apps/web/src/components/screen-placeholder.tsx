import { Sparkles } from 'lucide-react'

/** Temporary stub shown until a screen is implemented. Replaced wholesale per screen. */
export function ScreenPlaceholder({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-accent/25 text-accent-foreground">
        <Sparkles className="size-7" />
      </div>
      <h1 className="font-display text-2xl font-semibold">{title}</h1>
      {note && <p className="max-w-md text-sm text-muted-foreground">{note}</p>}
      <p className="text-2xs uppercase tracking-wide text-muted-foreground/60">Coming together…</p>
    </div>
  )
}
