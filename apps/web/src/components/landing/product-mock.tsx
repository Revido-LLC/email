import { CATEGORIES, getThread, type Thread } from '@revido/mock-data'
import { AiTag, Badge, CategoryChip, ContactAvatar, PriorityDot, Sparkle, cn } from '@revido/ui'
import { Check, Sparkles, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/i18n/format'

const MOCK_THREAD_IDS = ['t-acme', 't-priya', 't-elena']

/** Illustrative "today" date shown in the hero mock — not the real clock. */
const MOCK_TODAY = new Date(2026, 6, 15)

/**
 * A stylized "Today"-style card built from the real kit — this is the hero
 * visual that sells the product. Purely illustrative, no interactivity.
 */
export function ProductMock({ className }: { className?: string }) {
  const { t } = useTranslation()
  const threads = MOCK_THREAD_IDS.map(getThread).filter((thread): thread is Thread => Boolean(thread))

  return (
    <div className={cn('relative max-w-full', className)}>
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              <Sun className="size-3.5 text-accent" />
              {formatDate(MOCK_TODAY, { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
            <div className="mt-0.5 text-xl font-semibold tracking-tight">
              {t('landing.mock.greeting', { name: 'Sam' })}
            </div>
          </div>
          <AiTag label={t('landing.mock.triaged')} />
        </div>

        {/* Stat strip */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          <MockStat n="6" label={t('landing.mock.statNeedYou')} />
          <MockStat n="3" label={t('landing.mock.statPromises')} />
          <MockStat n="24" label={t('landing.mock.statHandled')} ai />
        </div>

        {/* Thread rows */}
        <div className="space-y-0.5 rounded-2xl border border-border bg-background/60 p-2">
          {threads.map((thread) => (
            <MockRow key={thread.id} thread={thread} />
          ))}
        </div>

        {/* Agent footer */}
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-ai/10 p-2.5">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-ai/15 text-ai">
            <Sparkles className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{t('landing.mock.agentsLabel')}</span>{' '}
            {t('landing.mock.agentsSummary', { newsletters: 6, receipts: 2 })}
          </span>
          <Badge variant="ai" className="shrink-0 gap-1">
            <Check className="size-3" /> {t('landing.mock.done')}
          </Badge>
        </div>
      </div>
    </div>
  )
}

function MockStat({ n, label, ai }: { n: string; label: string; ai?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-subtle p-2.5">
      {ai && <Sparkle className="absolute right-1.5 top-1.5 size-3" />}
      <div className="text-lg font-semibold leading-none">{n}</div>
      <div className="mt-1 text-2xs text-muted-foreground">{label}</div>
    </div>
  )
}

function MockRow({ thread }: { thread: Thread }) {
  const meta = CATEGORIES[thread.category]
  const sender = thread.participants[0]!

  return (
    <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
      <PriorityDot priority={thread.priority} className="shrink-0" />
      <ContactAvatar name={sender.name} className="size-7 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium">{sender.name}</span>
          <CategoryChip token={meta.token} label={meta.label} className="shrink-0" />
        </div>
        <div className="mt-0.5">
          <span className="truncate text-2xs text-muted-foreground">{thread.tldr}</span>
        </div>
      </div>
    </div>
  )
}
