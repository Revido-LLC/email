// i18n-todo: extract hardcoded copy in this component to the en/nl catalogs (see apps/web/src/i18n)
import { Link } from '@tanstack/react-router'
import { USER, type Thread } from '@revido/mock-data'
import { AiTag, Button, Sparkle } from '@revido/ui'
import { PenLine, Send, Sparkles, X } from 'lucide-react'
import * as React from 'react'

export function ReplyZone({ thread }: { thread: Thread }) {
  const replies = quickReplies(thread)
  const [draft, setDraft] = React.useState<string | null>(null)

  return (
    <div className="glass-thin shrink-0 border-x-0 border-b-0 px-4 py-3">
      <div className="mx-auto w-full max-w-3xl">
        {draft !== null && (
          <div className="mb-3 rounded-2xl border border-border bg-card p-3 shadow-soft">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                <Sparkle className="size-3" /> Reply preview
              </span>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Discard reply"
              >
                <X className="size-4" />
              </button>
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground/70"
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                Discard
              </Button>
              <Button variant="primary" size="sm">
                <Send className="size-3.5" /> Send
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AiTag label="Quick reply" />
          </span>
          {replies.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setDraft(r)}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/40 hover:bg-muted"
            >
              {r}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ai" size="sm" onClick={() => setDraft(fullDraft(thread))}>
              <Sparkles className="size-3.5" /> Write full draft
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/app/compose">
                <PenLine className="size-3.5" /> Open composer
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function quickReplies(thread: Thread): string[] {
  switch (thread.id) {
    case 't-acme':
      return [
        'Confirmed — the dashboard’s included and July 22 works',
        'Thursday call sounds great',
        'Sending a calendar hold now',
      ]
    case 't-priya':
      return [
        'Yes — we’re taking projects this quarter',
        'Love this, can we hop on a call?',
        'Give me until Friday to scope it',
      ]
    case 't-marcus':
      return [
        'Does Wednesday at 2pm work?',
        'Sending a calendar invite now',
        'Let’s do Tuesday afternoon',
      ]
    case 't-sarah':
      return [
        'These look great — ship it',
        'One small tweak, sending notes',
        'Thank you! No changes needed',
      ]
    case 't-elena':
      return [
        'Wouldn’t miss it — count me in',
        'Yes, two of us for dinner',
        'I’ll be there Saturday ❤️',
      ]
    case 't-dan':
      return [
        'Just floating this back up',
        'Happy to adjust the terms',
        'Want to grab 15 min this week?',
      ]
    default:
      return ['Sounds great — let’s proceed', 'Can we hop on a call?', 'Give me until Friday']
  }
}

function fullDraft(thread: Thread): string {
  if (thread.id === 't-acme')
    return 'Hi John — glad the team’s on board. Confirming both: the $48,000 includes the analytics dashboard, and we can kick off by July 22. I’ll send a calendar hold for a Thursday call. Talk soon, Sam'
  const other =
    thread.participants.find((p) => p.email !== USER.email)?.name.split(' ')[0] ?? 'there'
  return `Hi ${other} — thanks for the note. Happy to help here; let me pull the details together and get back to you shortly. Best, Sam`
}
