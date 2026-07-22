// i18n-todo: extract hardcoded copy in this component to the en/nl catalogs (see apps/web/src/i18n)
import type { AgentDef } from '@revido/db'
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
import {
  useClarifyAgent,
  useCompileAgent,
  useDryRunAgent,
  type ClarifyAnswer,
  type ClarifyQuestion,
  type DryRunResult,
} from '@/lib/hooks/agents'
import {
  compilePlan,
  forwardActionTo,
  planFromAgent,
  planHasForward,
  planNeedsApproval,
  planToDisplay,
  toAgentPlan,
  type CompiledPlan,
} from './compile'

export type CreateAgentInput = {
  name: string
  description: string
  plan: AgentPlan
  trusted?: boolean
}
export type WizardSeed = { kind: 'nl'; text: string } | { kind: 'agent'; agent: AgentDef }

type Step = 'describe' | 'refine' | 'plan' | 'dryrun' | 'name'

const STEPS: { id: Step; label: string }[] = [
  { id: 'describe', label: 'Describe' },
  { id: 'refine', label: 'Refine' },
  { id: 'plan', label: 'Plan' },
  { id: 'dryrun', label: 'Dry-run' },
  { id: 'name', label: 'Enable' },
]

/** Cap on dry-run rows rendered at once — a large match set must not jank the modal. */
const MAX_PREVIEW_ROWS = 50

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
  // The real (server-compiled) plan we submit — preserves forward params + content
  // clauses the client display can't represent. Null until the compile call lands.
  const [apiPlan, setApiPlan] = React.useState<AgentPlan | null>(null)
  const [trusted, setTrusted] = React.useState(false)
  const [forwardTo, setForwardTo] = React.useState('')
  const compile = useCompileAgent()
  const clarify = useClarifyAgent()
  const dryRun = useDryRunAgent()
  const [questions, setQuestions] = React.useState<ClarifyQuestion[]>([])
  // answerState: questionId → selected option ids (seeded from the model's defaults).
  const [answerState, setAnswerState] = React.useState<Record<string, string[]>>({})
  const [dryRunResult, setDryRunResult] = React.useState<DryRunResult | null>(null)

  const isForward = apiPlan != null && planHasForward(apiPlan)
  const stepIndex = STEPS.findIndex((s) => s.id === step)
  const alreadyActive = fromAgent && seed.agent.enabled

  /**
   * Fetch grounded, pre-answered refining questions before compiling. When the
   * model returns none (or the call fails), skip straight to the compile.
   */
  async function fetchClarify() {
    try {
      const { questions } = await clarify.mutateAsync({ description })
      setQuestions(questions)
      setAnswerState(Object.fromEntries(questions.map((q) => [q.id, q.defaultOptionIds])))
      if (questions.length === 0) await compileAndAdvance()
      else setStep('refine')
    } catch {
      await compileAndAdvance()
    }
  }

  /** Resolve the current selections into human-readable answers for the compiler. */
  function selectedAnswers(): ClarifyAnswer[] {
    return questions.map((q) => ({
      question: q.question,
      answer: (answerState[q.id] ?? [])
        .map((id) => q.options.find((o) => o.id === id)?.label)
        .filter(Boolean)
        .join(', '),
    }))
  }

  async function compileAndAdvance() {
    // Server-side natural-language compile (Opus), steered by the clarify answers.
    // The escalation model occasionally emits an invalid plan (provider json_schema
    // variance) even with the server's own retries; retry the whole call a couple
    // more times before dropping to the offline preview compiler, since that fallback
    // is a metadata-only plan that can't run the content pre-filter/classifier.
    const answers = selectedAnswers()
    let compiled: AgentPlan | null = null
    for (let attempt = 0; attempt < 3 && !compiled; attempt++) {
      try {
        compiled = await compile.mutateAsync({ description, answers })
      } catch {
        compiled = null
      }
    }
    if (compiled) {
      setApiPlan(compiled)
      setPlan(planToDisplay(compiled, description.trim().slice(0, 40) || 'New agent'))
      setForwardTo(forwardActionTo(compiled) ?? '')
    } else {
      setApiPlan(null)
      setPlan(compilePlan(description))
    }
    setStep('plan')
  }

  /** Run the honest server dry-run for the plan we would actually submit. */
  async function runDryRun() {
    setStep('dryrun')
    try {
      setDryRunResult(await dryRun.mutateAsync({ plan: submitPlan() }))
    } catch {
      setDryRunResult(null)
    }
  }

  function finish() {
    if (fromAgent) {
      if (!seed.agent.enabled) onEnableExisting(seed.agent.id)
    } else {
      onCreate({
        name: name.trim() || plan.suggestedName,
        description: description.trim() || `Automatically handles mail ${plan.matchLabel}.`,
        plan: submitPlan(),
        trusted: isForward ? trusted : undefined,
      })
    }
    onClose()
  }

  /** The plan to persist: the real API plan with the edited forward destination. */
  function submitPlan(): AgentPlan {
    if (!apiPlan) return toAgentPlan(plan)
    return {
      ...apiPlan,
      actions: apiPlan.actions.map((a) =>
        a.type === 'forward'
          ? { ...a, params: { ...(a.params ?? {}), to: forwardTo.trim() } }
          : a,
      ),
    }
  }

  return (
    // `w-full min-w-0` binds the body to the dialog's max-w-xl. Without it the Radix
    // grid dialog sizes this to max-content — the 5-step stepper + dry-run list then
    // balloon the modal past its width and overflow the right edge.
    <div className="flex w-full min-w-0 flex-col">
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

        {step === 'refine' && (
          <div className="space-y-4">
            <AiTag label="A few quick questions" />
            {questions.map((q) => (
              <div key={q.id} className="space-y-2">
                <p className="text-sm font-medium">{q.question}</p>
                <div className="flex flex-wrap gap-1.5">
                  {q.options.map((o) => {
                    const selected = (answerState[q.id] ?? []).includes(o.id)
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() =>
                          setAnswerState((prev) => {
                            const cur = prev[q.id] ?? []
                            const next = q.multi
                              ? selected
                                ? cur.filter((x) => x !== o.id)
                                : [...cur, o.id]
                              : [o.id]
                            return { ...prev, [q.id]: next }
                          })
                        }
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs transition-colors',
                          selected
                            ? 'border-ai bg-ai/10 text-ai'
                            : 'border-border bg-muted/50 text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {o.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Pre-filled with our best guesses — tweak anything, or just continue.
            </p>
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

        {step === 'dryrun' && <DryRun result={dryRunResult} loading={dryRun.isPending} />}

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

            {isForward && (
              <div className="space-y-3 rounded-2xl border border-border bg-card p-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Forward matching mail to
                  </label>
                  <Input
                    value={forwardTo}
                    onChange={(e) => setForwardTo(e.target.value)}
                    placeholder="accounting@revido.co"
                    className="mt-1"
                    type="email"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setTrusted((v) => !v)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">Forward automatically</span>
                    <span className="block text-xs text-muted-foreground">
                      {trusted
                        ? 'Forwards the moment a match arrives (10-second undo).'
                        : 'Off — each forward waits for your one-tap approval.'}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
                      trusted ? 'bg-ai' : 'bg-muted',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-block size-4 rounded-full bg-white transition-transform',
                        trusted ? 'translate-x-4' : 'translate-x-0.5',
                      )}
                    />
                  </span>
                </button>
              </div>
            )}
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
          <Button
            variant="ai"
            onClick={fetchClarify}
            disabled={description.trim().length < 4 || clarify.isPending}
          >
            <Sparkles /> {clarify.isPending ? 'Thinking…' : 'Continue'}
          </Button>
        )}
        {step === 'refine' && (
          <Button variant="ai" onClick={compileAndAdvance} disabled={compile.isPending}>
            <Sparkles /> {compile.isPending ? 'Compiling…' : 'Compile plan'}
          </Button>
        )}
        {step === 'plan' && (
          <Button onClick={runDryRun}>
            <FlaskConical /> Dry-run on history
          </Button>
        )}
        {step === 'dryrun' && (
          <Button onClick={() => setStep('name')}>
            Looks right <ChevronRight />
          </Button>
        )}
        {step === 'name' && (
          <Button
            variant="ai"
            onClick={finish}
            disabled={isForward && forwardTo.trim().length === 0}
          >
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

function DryRun({ result, loading }: { result: DryRunResult | null; loading: boolean }) {
  if (loading || !result) {
    return (
      <div className="space-y-3">
        <AiTag label="Dry-run · last 30 days" />
        <p className="rounded-xl bg-muted/50 p-6 text-center text-sm text-muted-foreground">
          {loading ? 'Testing against your real mail…' : 'No preview available.'}
        </p>
      </div>
    )
  }
  const { matched, estimatedMatches, sampledCount, excludedCount, excludedReasons } = result
  const more = Math.max(0, estimatedMatches - matched.length)
  return (
    <div className="space-y-3">
      <AiTag label="Dry-run · last 30 days" />
      <div className="rounded-2xl border border-ai/20 bg-ai/5 p-4 text-center">
        <div className="text-2xl font-semibold tabular-nums text-ai">{estimatedMatches}</div>
        <p className="mt-1 text-sm text-muted-foreground">
          {estimatedMatches === 1 ? 'email' : 'emails'} this would handle
          {sampledCount > 0 && more > 0 ? ` · checked ${sampledCount}, ~${more} more likely` : ''}
        </p>
      </div>

      {excludedCount > 0 && (
        <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{excludedCount} excluded</span> —{' '}
          {excludedReasons.map((r) => r.label.toLowerCase()).join('; ')}. Filtered for free before any AI.
        </div>
      )}

      {matched.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="border-b border-border bg-muted/40 px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            Confirmed matches
          </div>
          <ScrollArea className="max-h-52">
            <div className="divide-y divide-border">
              {matched.slice(0, MAX_PREVIEW_ROWS).map((t) => (
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
              {matched.length > MAX_PREVIEW_ROWS && (
                <p className="px-3 py-2 text-center text-xs text-muted-foreground">
                  + {matched.length - MAX_PREVIEW_ROWS} more
                </p>
              )}
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
