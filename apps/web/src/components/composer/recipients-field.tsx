// i18n-todo: extract hardcoded copy in this component to the en/nl catalogs (see apps/web/src/i18n)
import { X } from 'lucide-react'
import * as React from 'react'
import { cn } from '@revido/ui'

/**
 * The "To" field. Entered addresses become removable chips; the raw input keeps
 * flowing after each one. Backspace on an empty input pops the last chip.
 */
export function RecipientsField() {
  const [recipients, setRecipients] = React.useState<string[]>([])
  const [value, setValue] = React.useState('')

  function commit() {
    const next = value
      .trim()
      .replace(/[,;]+$/, '')
      .trim()
    setValue('')
    if (!next) return
    setRecipients((prev) => (prev.includes(next) ? prev : [...prev, next]))
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === 'Enter' || e.key === ',' || e.key === ';') && value.trim()) {
      e.preventDefault()
      commit()
    } else if (e.key === 'Backspace' && !value && recipients.length) {
      setRecipients((prev) => prev.slice(0, -1))
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {recipients.map((r) => (
        <span
          key={r}
          className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pl-2.5 pr-1 text-xs font-medium text-foreground"
        >
          {r}
          <button
            type="button"
            aria-label={`Remove ${r}`}
            onClick={() => setRecipients((prev) => prev.filter((x) => x !== r))}
            className={cn(
              'flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors',
              'hover:bg-secondary hover:text-foreground',
            )}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={recipients.length ? 'Add another…' : 'Add people…'}
        className="h-7 min-w-32 flex-1 bg-transparent text-sm outline-none sm:min-w-40 placeholder:text-muted-foreground/70"
      />
    </div>
  )
}
