import { createFileRoute, useNavigate } from '@tanstack/react-router'
import type { AgentProposal } from '@revido/db'
import {
  AiTag,
  Button,
  CATEGORY_CLASSES,
  Card,
  CategoryDot,
  Progress,
  Sparkle,
  Switch,
  cn,
  type CategoryToken,
} from '@revido/ui'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Check, Loader2, Monitor, Moon, Sparkles, Sun } from 'lucide-react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '@/lib/icons'
import { formatNumber } from '@/i18n/format'
import { useAppState, type ThemePreference } from '@/lib/app-state'
import { useAgentProposals, useEnableProposedAgents, useMe, useOnboardingScan } from '@/lib/hooks'

export const Route = createFileRoute('/onboarding')({
  component: OnboardingScreen,
})

const STAGES = ['appearance', 'connecting', 'reading', 'ready', 'proposals'] as const
type Stage = (typeof STAGES)[number]

/** How long each auto-advancing stage lingers before moving on. Snappy. */
const STAGE_MS: Record<Stage, number> = {
  appearance: 0,
  connecting: 1500,
  reading: 2000,
  ready: 1300,
  proposals: 0,
}

function OnboardingScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  // The appearance picker leads (user-driven); the scan stages auto-advance.
  const [stage, setStage] = React.useState<Stage>('appearance')
  const [connected, setConnected] = React.useState(false)

  // Drive the stage machine forward on a timer (appearance + proposals are terminal).
  React.useEffect(() => {
    if (stage === 'proposals' || stage === 'appearance') return
    const id = setTimeout(() => {
      setStage((s) => STAGES[STAGES.indexOf(s) + 1] ?? s)
    }, STAGE_MS[stage])
    return () => clearTimeout(id)
  }, [stage])

  // A little "Connecting… → Connected ✓" beat inside the first stage.
  React.useEffect(() => {
    if (stage !== 'connecting') return
    setConnected(false)
    const id = setTimeout(() => setConnected(true), 900)
    return () => clearTimeout(id)
  }, [stage])

  const stageIndex = STAGES.indexOf(stage)
  const goToInbox = () => navigate({ to: '/app' })

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="relative mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-8 sm:px-6">
        {/* Persistent header: wordmark + 4-stage indicator */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
              <Sparkles className="size-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">{t('common.brand')}</span>
          </div>
          <div className="flex items-center gap-1.5" aria-label="Setup progress">
            {STAGES.map((s, i) => (
              <span
                key={s}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-500 ease-out',
                  i === stageIndex ? 'w-6' : 'w-4',
                  i <= stageIndex ? 'bg-primary' : 'bg-border',
                )}
              />
            ))}
          </div>
        </header>

        <main className="flex flex-1 flex-col items-center justify-center py-10">
          {stage === 'appearance' ? (
            <AppearanceStep onContinue={() => setStage('connecting')} />
          ) : stage === 'proposals' ? (
            <ProposalsView onContinue={goToInbox} />
          ) : (
            <ScanView stage={stage} connected={connected} />
          )}
        </main>

        <footer className="flex items-center justify-center gap-1.5 pb-1 text-2xs text-muted-foreground/70">
          <Sparkles className="size-3 text-ai/70" />
          {t('onboarding.footer')}
        </footer>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Scan phase (connecting → reading → ready)                          */
/* ------------------------------------------------------------------ */

function ScanView({ stage, connected }: { stage: Stage; connected: boolean }) {
  const { t } = useTranslation()
  const { data: scan } = useOnboardingScan()
  const { data: me } = useMe()
  const email = me?.email ?? ''
  const started = stage !== 'connecting'
  const totalThreads = scan?.totalThreads ?? 0
  const total = useCountUp(totalThreads, 1400, started)
  const needReplies = useCountUp(scan?.needReplies ?? 0, 1400, started)
  const newsletters = useCountUp(scan?.newsletters ?? 0, 1400, started)
  const invoices = useCountUp(scan?.invoices ?? 0, 1400, started)

  const beat = stage === 'connecting' ? (connected ? 'connected' : 'connecting') : stage

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="w-full max-w-md"
    >
      <Card className="rounded-2xl border-border/70 p-6 text-center shadow-soft sm:p-8">
        <Orb stage={stage} connected={connected} />

        <AnimatePresence mode="wait">
          <motion.div
            key={beat}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {beat === 'connecting' && (
              <>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {t('onboarding.scan.connecting.title')}
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">{email}</p>
              </>
            )}

            {beat === 'connected' && (
              <>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {t('onboarding.scan.connected.title')}
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {t('onboarding.scan.connected.subtitle', { email })}
                </p>
              </>
            )}

            {beat === 'reading' && (
              <>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {t('onboarding.scan.reading.title')}
                </h1>
                <p className="mt-1.5 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                  <Sparkle className="size-3.5" />
                  {t('onboarding.scan.reading.subtitle')}
                </p>

                <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
                  <ScanStat
                    token="to-reply"
                    value={needReplies}
                    label={t('onboarding.scan.reading.needReplies')}
                  />
                  <ScanStat
                    token="newsletters"
                    value={newsletters}
                    label={t('onboarding.scan.reading.newsletters')}
                  />
                  <ScanStat
                    token="receipts"
                    value={invoices}
                    label={t('onboarding.scan.reading.invoices')}
                  />
                </div>

                <Progress
                  value={totalThreads ? total / totalThreads : 0}
                  className="mt-5"
                  barClassName="bg-ai"
                />
                <p className="mt-2 text-2xs tabular-nums text-muted-foreground">
                  {t('onboarding.scan.reading.progress', {
                    scanned: formatNumber(total),
                    total: formatNumber(totalThreads),
                  })}
                </p>
              </>
            )}

            {beat === 'ready' && (
              <>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {t('onboarding.scan.ready.title')}
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {t('onboarding.scan.ready.subtitle')}
                </p>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </Card>
    </motion.div>
  )
}

function Orb({ stage, connected }: { stage: Stage; connected: boolean }) {
  const tone =
    stage === 'ready'
      ? 'bg-success/15 text-success'
      : stage === 'reading'
        ? 'bg-ai/12 text-ai'
        : 'bg-primary/12 text-primary'

  return (
    <div className={cn('mx-auto mb-5 flex size-12 items-center justify-center rounded-2xl', tone)}>
      <AnimatePresence mode="wait">
        {stage === 'connecting' && !connected && (
          <motion.span
            key="spin"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Loader2 className="size-8 animate-spin" />
          </motion.span>
        )}
        {stage === 'connecting' && connected && (
          <motion.span
            key="conn"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18 }}
          >
            <Check className="size-8" />
          </motion.span>
        )}
        {stage === 'reading' && (
          <motion.span
            key="read"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <Sparkles className="size-7 animate-pulse" />
          </motion.span>
        )}
        {stage === 'ready' && (
          <motion.span
            key="done"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 16 }}
          >
            <Check className="size-9" />
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}

function ScanStat({ token, value, label }: { token: string; value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <CategoryDot token={token} />
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Proposals phase                                                    */
/* ------------------------------------------------------------------ */

function ProposalsView({ onContinue }: { onContinue: () => void }) {
  const { t } = useTranslation()
  const { data } = useAgentProposals()
  const enableAgents = useEnableProposedAgents()
  const proposals = React.useMemo(() => (data ?? []).slice(0, 3), [data])
  const [enabled, setEnabled] = React.useState<Record<string, boolean>>({})

  // Default the first two proposals on once they load.
  const seededRef = React.useRef(false)
  React.useEffect(() => {
    if (!seededRef.current && proposals.length > 0) {
      seededRef.current = true
      setEnabled(Object.fromEntries(proposals.map((p, i) => [p.id, i < 2])))
    }
  }, [proposals])

  const onCount = Object.values(enabled).filter(Boolean).length

  const finish = () => {
    const toEnable = Object.entries(enabled)
      .filter(([, on]) => on)
      .map(([id]) => id)
    if (toEnable.length > 0) enableAgents.mutate(toEnable)
    onContinue()
  }

  return (
    <motion.div
      initial={{ y: 10 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="w-full"
    >
      <div className="text-center">
        <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-2xl bg-ai/12 text-ai">
          <Sparkles className="size-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{t('onboarding.proposals.title')}</h1>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          <Sparkle className="size-3.5" />
          {t('onboarding.proposals.subtitle')}
        </p>
      </div>

      <div className="mt-6 space-y-3">
        {proposals.map((p, i) => (
          <ProposalCard
            key={p.id}
            proposal={p}
            index={i}
            on={enabled[p.id] ?? false}
            onToggle={(v) => setEnabled((prev) => ({ ...prev, [p.id]: v }))}
          />
        ))}
      </div>

      <div className="mt-7 flex flex-col items-center gap-3">
        <Button className="w-full" onClick={finish}>
          {t('onboarding.proposals.continue')}
          <ArrowRight className="size-4" />
        </Button>
        <button
          type="button"
          onClick={onContinue}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {t('onboarding.proposals.skip')}
        </button>
        <p className="text-2xs text-muted-foreground/70">
          {t('onboarding.proposals.agentsCount', { count: onCount })}
        </p>
      </div>
    </motion.div>
  )
}

function ProposalCard({
  proposal,
  index,
  on,
  onToggle,
}: {
  proposal: AgentProposal
  index: number
  on: boolean
  onToggle: (value: boolean) => void
}) {
  const { t } = useTranslation()
  const cls = CATEGORY_CLASSES[proposal.accent as CategoryToken] ?? CATEGORY_CLASSES.fyi

  return (
    <motion.div
      initial={{ y: 12 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut', delay: 0.08 * index }}
    >
      <Card
        className={cn(
          'flex items-start gap-4 rounded-2xl p-4 shadow-soft transition-colors',
          on ? 'border-primary/30 bg-card' : 'border-border bg-card/60',
        )}
      >
        <div
          className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', cls.chip)}
        >
          <Icon name={proposal.icon} className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn('text-base font-semibold', cls.text)}>
              {proposal.metric}
            </span>
            <AiTag />
          </div>
          <p className="mt-0.5 text-sm font-medium text-foreground">{proposal.title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{proposal.detail}</p>
        </div>
        <Switch
          checked={on}
          onCheckedChange={onToggle}
          className="mt-1 shrink-0"
          aria-label={t('onboarding.proposals.enableAria', { title: proposal.title })}
        />
      </Card>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Appearance step — Light / Dark / System, live-previewing the shell  */
/* ------------------------------------------------------------------ */

function AppearanceStep({ onContinue }: { onContinue: () => void }) {
  const { t } = useTranslation()
  const { themePreference, setThemePreference } = useAppState()

  const options: { id: ThemePreference; icon: React.ReactNode }[] = [
    { id: 'light', icon: <Sun className="size-5" /> },
    { id: 'dark', icon: <Moon className="size-5" /> },
    { id: 'system', icon: <Monitor className="size-5" /> },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="w-full max-w-md"
    >
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <Sun className="size-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{t('onboarding.appearance.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('onboarding.appearance.subtitle')}</p>
      </div>

      {/* A tiny shell preview that re-themes live with the selection. */}
      <div className="mb-5 overflow-hidden rounded-2xl border border-border shadow-soft">
        <div className="flex">
          <div className="w-16 shrink-0 space-y-1.5 border-r border-border bg-subtle p-2.5">
            <div className="h-2 w-full rounded bg-primary/30" />
            <div className="h-2 w-3/4 rounded bg-muted" />
            <div className="h-2 w-2/3 rounded bg-muted" />
          </div>
          <div className="flex-1 space-y-2 bg-card p-3">
            <div className="h-2.5 w-1/2 rounded bg-foreground/20" />
            <div className="h-2 w-full rounded bg-muted" />
            <div className="h-2 w-4/5 rounded bg-muted" />
            <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-ai/12 px-2 py-0.5">
              <Sparkle className="size-2.5" />
              <span className="h-1.5 w-8 rounded bg-ai/40" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {options.map((opt) => {
          const active = themePreference === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setThemePreference(opt.id)}
              aria-pressed={active}
              className={cn(
                'flex flex-col items-center gap-2 rounded-2xl border p-4 text-sm font-medium transition-colors',
                active
                  ? 'border-primary/40 bg-primary/5 text-primary'
                  : 'border-border text-muted-foreground hover:border-ring hover:text-foreground',
              )}
            >
              <span
                className={cn(
                  'flex size-10 items-center justify-center rounded-xl',
                  active ? 'bg-primary/12 text-primary' : 'bg-muted text-muted-foreground',
                )}
              >
                {opt.icon}
              </span>
              {t(`onboarding.appearance.options.${opt.id}`)}
            </button>
          )
        })}
      </div>

      <Button className="mt-6 w-full" onClick={onContinue}>
        {t('onboarding.appearance.continue')}
        <ArrowRight className="size-4" />
      </Button>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Count-up hook — animates 0 → target with easeOutCubic              */
/* ------------------------------------------------------------------ */

function useCountUp(target: number, duration: number, active: boolean) {
  const [value, setValue] = React.useState(0)

  React.useEffect(() => {
    if (!active) {
      setValue(0)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(eased * target))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, active])

  return value
}
