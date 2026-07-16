// i18n-todo: extract hardcoded copy in this component to the en/nl catalogs (see apps/web/src/i18n)
import { Button, Sparkle } from '@revido/ui'
import type { ToneKey } from './draft-data'

const TONES: { key: ToneKey; label: string }[] = [
  { key: 'shorter', label: 'Shorter' },
  { key: 'friendlier', label: 'Friendlier' },
  { key: 'formal', label: 'More formal' },
]

/** AI tone rewrites — each swaps the draft for a re-streamed variant. */
export function ToneChips({
  onTone,
  activeTone,
  disabled,
}: {
  onTone: (tone: ToneKey) => void
  activeTone: ToneKey | null
  disabled: boolean
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ai/15 pt-3">
      <span className="flex items-center gap-1 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
        <Sparkle className="size-3" /> Adjust tone
      </span>
      {TONES.map((t) => (
        <Button
          key={t.key}
          type="button"
          size="sm"
          variant={activeTone === t.key ? 'ai' : 'outline'}
          onClick={() => onTone(t.key)}
          disabled={disabled}
          className="rounded-full"
        >
          {t.label}
        </Button>
      ))}
    </div>
  )
}
