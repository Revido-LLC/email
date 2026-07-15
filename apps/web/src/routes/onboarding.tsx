import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AGENT_PROPOSALS, ONBOARDING_SCAN, USER, type AgentProposal } from '@revido/mock-data'
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
import { ArrowRight, Check, Loader2, Sparkles } from 'lucide-react'
import * as React from 'react'
import { Icon } from '@/lib/icons'

export const Route = createFileRoute('/onboarding')({
  component: OnboardingScreen,
})

const STAGES = ['connecting', 'reading', 'ready', 'proposals'] as const
type Stage = (typeof STAGES)[number]

/** How long each auto-advancing stage lingers before moving on. Snappy. */
const STAGE_MS: Record<Stage, number> = {
  connecting: 1500,
  reading: 2000,
  ready: 1300,
  proposals: 0,
}

function OnboardingScreen() {
  const navigate = useNavigate()
  const [stage, setStage] = React.useState<Stage>('connecting')
  const [connected, setConnected] = React.useState(false)

  // Drive the stage machine forward on a timer (proposals is terminal).
  React.useEffect(() => {
    if (stage === 'proposals') return
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
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-accent/10 via-background to-primary/8">
      {/* Warm ambient blobs */}
      <div className="pointer-events-none absolute -left-24 top-8 size-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-4 size-80 rounded-full bg-ai/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-8">
        {/* Persistent header: wordmark + 4-stage indicator */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
              <Sparkles className="size-5" />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight">Revido Mail</span>
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
          {stage === 'proposals' ? (
            <ProposalsView onContinue={goToInbox} />
          ) : (
            <ScanView stage={stage} connected={connected} />
          )}
        </main>

        <footer className="flex items-center justify-center gap-1.5 pb-1 text-2xs text-muted-foreground/70">
          <Sparkles className="size-3 text-ai/70" />
          Built by Revido · we build custom AI tools
        </footer>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Scan phase (connecting → reading → ready)                          */
/* ------------------------------------------------------------------ */

function ScanView({ stage, connected }: { stage: Stage; connected: boolean }) {
  const started = stage !== 'connecting'
  const total = useCountUp(ONBOARDING_SCAN.totalThreads, 1400, started)
  const needReplies = useCountUp(ONBOARDING_SCAN.needReplies, 1400, started)
  const newsletters = useCountUp(ONBOARDING_SCAN.newsletters, 1400, started)
  const invoices = useCountUp(ONBOARDING_SCAN.invoices, 1400, started)

  const beat = stage === 'connecting' ? (connected ? 'connected' : 'connecting') : stage

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="w-full max-w-md"
    >
      <Card className="rounded-3xl border-border/70 p-8 text-center shadow-soft">
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
                <h1 className="font-display text-2xl font-semibold tracking-tight">
                  Connecting your inbox…
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">{USER.email}</p>
              </>
            )}

            {beat === 'connected' && (
              <>
                <h1 className="font-display text-2xl font-semibold tracking-tight">
                  Connected <span className="text-success">✓</span>
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">Secure link to {USER.email}</p>
              </>
            )}

            {beat === 'reading' && (
              <>
                <h1 className="font-display text-2xl font-semibold tracking-tight">
                  Reading your recent mail…
                </h1>
                <p className="mt-1.5 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                  <Sparkle className="size-3.5" />
                  Revido is triaging in real time
                </p>

                <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
                  <ScanStat token="to-reply" value={needReplies} label="need replies" />
                  <ScanStat token="newsletters" value={newsletters} label="newsletters" />
                  <ScanStat token="receipts" value={invoices} label="invoices" />
                </div>

                <Progress
                  value={total / ONBOARDING_SCAN.totalThreads}
                  className="mt-5"
                  barClassName="bg-ai"
                />
                <p className="mt-2 text-2xs tabular-nums text-muted-foreground">
                  {total.toLocaleString()} of {ONBOARDING_SCAN.totalThreads.toLocaleString()}{' '}
                  conversations scanned
                </p>
              </>
            )}

            {beat === 'ready' && (
              <>
                <h1 className="font-display text-2xl font-semibold tracking-tight">
                  Preparing your first brief <span className="text-success">✓</span>
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Everything’s sorted — here’s what we can take off your plate.
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
    <div className={cn('mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl', tone)}>
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
      <span className="font-display font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Proposals phase                                                    */
/* ------------------------------------------------------------------ */

function ProposalsView({ onContinue }: { onContinue: () => void }) {
  const proposals = AGENT_PROPOSALS.slice(0, 3)
  const [enabled, setEnabled] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(proposals.map((p, i) => [p.id, i < 2])),
  )
  const onCount = Object.values(enabled).filter(Boolean).length

  return (
    <motion.div
      initial={{ y: 10 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="w-full"
    >
      <div className="text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-ai/12 text-ai">
          <Sparkles className="size-6" />
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          We found a few things we can automate
        </h1>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          <Sparkle className="size-3.5" />
          Flip on the agents you’d like — you can change these anytime.
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
        <Button size="lg" className="w-full" onClick={onContinue}>
          Continue to your inbox
          <ArrowRight className="size-4" />
        </Button>
        <button
          type="button"
          onClick={onContinue}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Skip for now
        </button>
        <p className="text-2xs text-muted-foreground/70">
          {onCount} {onCount === 1 ? 'agent' : 'agents'} will start working the moment you land.
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
            <span className={cn('font-display text-base font-semibold', cls.text)}>
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
          aria-label={`Enable ${proposal.title}`}
        />
      </Card>
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
