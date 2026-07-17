// i18n-todo: extract hardcoded copy in this component to the en/nl catalogs (see apps/web/src/i18n)
import type { AgentDef, Thread } from '@revido/db'
import type { AgentPlan } from '@revido/core'
import {
  AiTag,
  Badge,
  Button,
  CATEGORY_CLASSES,
  Dialog,
  DialogContent,
  Input,
  ScrollArea,
  Sparkle,
  Textarea,
  type CategoryToken,
  cn,
} from '@revido/ui'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock,
  FlaskConical,
  ListChecks,
  Sparkles,
  Wand2,
  Zap,
} from 'lucide-react'
import * as React from 'react'
import { Icon } from '@/lib/icons'
import { useThreadsByCategory } from '@/lib/hooks'
import {
  compilePlan,
  planFromAgent,
  planNeedsApproval,
  toAgentPlan,
  type CompiledPlan,
} from './compile'

export type CreateAgentInput = { name: string; description: string; plan: AgentPlan }
export type WizardSeed = { kind: 'nl'; text: string } | { kind: 'agent'; agent: AgentDef }

type Step = 'describe' | 'plan' | 'dryrun' | 'name'

const STEPS: { id: Step; label: string }[] = [
  { id: 'describe', label: 'Describe' },
  { id: 'plan', label: 'Plan' },
  { id: 'dryrun', label: 'Dry-run' },
  { id: 'name', label: 'Enable' },
]

const SUGGESTIONS = [
  'Label all invoices and receipts, then mark them FYI',
  'Chase people who never replied after 4 days',
  'Bundle newsletters I ignore into a daily digest',
]

function accentClasses(accent: string) {
  return CATEGORY_CLASSES[accent as CategoryToken] ?? CATEGORY_CLASSES.fyi
}

export function CreateAgentDialog({
  seed,
  onOpenChange,
  onCreate,
  onEnableExisting,
}: {
  seed: WizardSeed | null
  onOpenChange: (open: boolean) => void
  onCreate: (input: CreateAgentInput) => void
  onEnableExisting: (id: string) => void
}) {
  const seedKey =
    seed?.kind === 'agent'
      ? `agent:${seed.agent.id}`
      : seed?.kind === 'nl'
        ? `nl:${seed.text}`
        : 'closed'

  return (
    <Dialog open={seed !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 p-0">
        {seed && (
          <WizardBody
            key={seedKey}
            seed={seed}
            onCreate={onCreate}
            onEnableExisting={onEnableExisting}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function WizardBody({
  seed,
  onCreate,
  onEnableExisting,
  onClose,
}: {
  seed: WizardSeed
  onCreate: (input: CreateAgentInput) => void
  onEnableExisting: (id: string) => void
  onClose: () => void
}) {
  const fromAgent = seed.kind === 'agent'
  const [step, setStep] = React.useState<Step>(fromAgent ? 'plan' : 'describe')
  const [description, setDescription] = React.useState(
    seed.kind === 'nl' ? seed.text : seed.agent.description,
  )
  const [plan, setPlan] = React.useState<CompiledPlan>(() =>
    fromAgent ? planFromAgent(seed.agent) : compilePlan(seed.kind === 'nl' ? seed.text : ''),
  )
  const [name, setName] = React.useState(fromAgent ? seed.agent.name : '')

  // Dry-run preview over the user's real mail in the plan's category.
  const { data: candidates } = useThreadsByCategory(plan.category)
  const matches = React.useMemo(
    () => (candidates ?? []).filter(plan.predicate),
    [candidates, plan],
  )
  const stepIndex = STEPS.findIndex((s) => s.id === step)
  const alreadyActive = fromAgent && seed.agent.enabled

  function compileAndAdvance() {
    setPlan(compilePlan(description))
    setStep('plan')
  }

  function finish() {
    if (fromAgent) {
      if (!seed.agent.enabled) onEnableExisting(seed.agent.id)
    } else {
      onCreate({
        name: name.trim() || plan.suggestedName,
        description: description.trim() || `Automatically handles mail ${plan.matchLabel}.`,
        plan: toAgentPlan(plan),
      })
    }
    onClose()
  }

  return (
    <div className="flex flex-col">
      {/* Header + stepper */}
      <div className="border-b border-border px-6 pb-4 pt-6">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-ai/12 text-ai">
            <Wand2 className="size-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold leading-none">
              {fromAgent ? seed.agent.name : 'New agent'}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {fromAgent
                ? 'Review the plan, then switch it on.'
                : 'Describe it — we compile the rest.'}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'flex size-5 items-center justify-center rounded-full text-2xs font-semibold transition-colors',
                    i < stepIndex && 'bg-ai text-ai-foreground',
                    i === stepIndex && 'bg-ai/15 text-ai ring-2 ring-ai/40',
                    i > stepIndex && 'bg-muted text-muted-foreground',
                  )}
                >
                  {i < stepIndex ? <Check className="size-3" /> : i + 1}
                </span>
                <span
                  className={cn(
                    'text-xs font-medium',
                    i === stepIndex ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && <span className="h-px w-3 bg-border" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-5">
        {step === 'describe' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkle />
              <span className="text-sm font-medium">What should we automate?</span>
            </div>
            <Textarea
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Label all invoices, extract the amount, and file them by month…"
              className="min-h-28"
            />
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDescription(s)}
                  className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'plan' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <AiTag label="AI-compiled plan" />
              {planNeedsApproval(plan) ? (
                <Badge variant="warning" className="gap-1">
                  <Clock /> Asks before acting
                </Badge>
              ) : (
                <Badge variant="success" className="gap-1">
                  <Check /> Runs on its own
                </Badge>
              )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-border">
              <PlanRow icon={<Zap className="text-accent" />} label="Trigger">
                <span className="text-sm font-medium">{plan.trigger}</span>
              </PlanRow>
              <PlanRow icon={<ListChecks className="text-muted-foreground" />} label="Conditions">
                <div className="flex flex-col gap-1">
                  {plan.conditions.map((c) => (
                    <span key={c} className="text-sm">
                      {c}
                    </span>
                  ))}
                </div>
              </PlanRow>
              <PlanRow icon={<Sparkles className="text-ai" />} label="Actions" last>
                <div className="flex flex-wrap gap-1.5">
                  {plan.actions.map((a) => (
                    <Badge
                      key={a.label}
                      variant={a.needsApproval ? 'warning' : 'primary'}
                      className="gap-1"
                    >
                      {a.needsApproval && <Clock />}
                      {a.label}
                    </Badge>
                  ))}
                </div>
              </PlanRow>
            </div>
            <p className="text-xs text-muted-foreground">
              {planNeedsApproval(plan)
                ? 'Anything consequential waits in Approvals for your one-tap OK.'
                : 'These actions are safe and reversible, so this agent runs quietly on its own.'}
            </p>
          </div>
        )}

        {step === 'dryrun' && <DryRun plan={plan} matches={matches} />}

        {step === 'name' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
              <div
                className={cn(
                  'flex size-11 items-center justify-center rounded-xl',
                  accentClasses(plan.accent).chip,
                )}
              >
                <Icon name={plan.icon} className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <label className="text-xs font-medium text-muted-foreground">Name your agent</label>
                <Input
                  autoFocus={!fromAgent}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={plan.suggestedName}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-xl bg-ai/10 p-3">
              <Sparkle className="mt-0.5" />
              <p className="text-sm text-muted-foreground">
                {alreadyActive ? (
                  <>This agent is already active — it has your back.</>
                ) : (
                  <>
                    Once enabled, this will run{' '}
                    <span className="font-medium text-foreground">
                      {plan.trigger.toLowerCase()}
                    </span>{' '}
                    and handle mail {plan.matchLabel}. You can pause it anytime.
                  </>
                )}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer nav */}
      <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-4">
        {step === 'describe' || (fromAgent && step === 'plan') ? (
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)]!.id)}>
            <ArrowLeft /> Back
          </Button>
        )}

        {step === 'describe' && (
          <Button variant="ai" onClick={compileAndAdvance} disabled={description.trim().length < 4}>
            <Sparkles /> Compile plan
          </Button>
        )}
        {step === 'plan' && (
          <Button onClick={() => setStep('dryrun')}>
            <FlaskConical /> Dry-run on history
          </Button>
        )}
        {step === 'dryrun' && (
          <Button onClick={() => setStep('name')}>
            Looks right <ChevronRight />
          </Button>
        )}
        {step === 'name' && (
          <Button variant="ai" onClick={finish}>
            {alreadyActive ? (
              <>Done</>
            ) : (
              <>
                <Sparkles /> {fromAgent ? 'Enable agent' : 'Create & enable'}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}

function PlanRow({
  icon,
  label,
  children,
  last,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
  last?: boolean
}) {
  return (
    <div className={cn('flex gap-3 px-4 py-3', !last && 'border-b border-border')}>
      <div className="flex w-24 shrink-0 items-center gap-2">
        <span className="[&_svg]:size-4">{icon}</span>
        <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function DryRun({ plan, matches }: { plan: CompiledPlan; matches: Thread[] }) {
  return (
    <div className="space-y-3">
      <AiTag label="Dry-run · last 30 days" />
      <div className="rounded-2xl border border-ai/20 bg-ai/5 p-4 text-center">
        <div className="text-2xl font-semibold tabular-nums text-ai">{matches.length}</div>
        <p className="mt-1 text-sm text-muted-foreground">
          {matches.length === 1 ? 'email' : 'emails'} this would have handled — {plan.matchLabel}
        </p>
      </div>

      {matches.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="border-b border-border bg-muted/40 px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            What it would have caught
          </div>
          <ScrollArea className="max-h-52">
            <div className="divide-y divide-border">
              {matches.map((t) => (
                <Link
                  key={t.id}
                  to="/app/thread/$threadId"
                  params={{ threadId: t.id }}
                  className="group flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.subject}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.participants[0]?.name ?? 'Unknown sender'}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              ))}
            </div>
          </ScrollArea>
        </div>
      ) : (
        <p className="rounded-xl bg-muted/50 p-3 text-center text-sm text-muted-foreground">
          Nothing matched in the last 30 days — this agent will quietly wait for the next one.
        </p>
      )}
      <p className="text-center text-xs text-muted-foreground">
        Tested against your real history — no emails were touched.
      </p>
    </div>
  )
}
