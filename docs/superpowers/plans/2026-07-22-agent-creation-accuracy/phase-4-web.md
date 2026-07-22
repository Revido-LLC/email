# Phase 4 — Web: clarify step + honest dry-run

Tasks 8 → 9 → 10. Task 8 is hooks/types; Tasks 9 and 10 both edit `create-agent-dialog.tsx` (serialize). Depends on Phases 2 & 3 (both endpoints live).

**Phase verification gate:** `pnpm --filter @revido/web test && pnpm --filter @revido/web exec tsc --noEmit` — all green. Manual browser check: create "Forward every receipt to accounting@…"; confirm the Refine step shows pre-answered questions and the dry-run shows a small confirmed count plus an "N excluded" line (no FINAL-NOTICE / suspended / recharge subjects listed).

---

## Task 8: Hooks + types for clarify and server dry-run

**Files:**
- Modify: `apps/web/src/lib/hooks/agents.ts`

- [ ] **Step 1: Add clarify hook, dry-run result type, and compile answers**

Add to `apps/web/src/lib/hooks/agents.ts`:

```ts
export interface ClarifyOption {
  id: string
  label: string
}
export interface ClarifyQuestion {
  id: string
  question: string
  options: ClarifyOption[]
  multi: boolean
  defaultOptionIds: string[]
}
export interface ClarifyAnswer {
  question: string
  answer: string
}
export interface DryRunResult {
  matched: Thread[]
  candidateCount: number
  excludedCount: number
  excludedReasons: { label: string; count: number }[]
  sampledCount: number
  estimatedMatches: number
}

/** `POST /agents/clarify` — grounded, pre-answered refining questions. */
export function useClarifyAgent() {
  return useMutation({
    mutationFn: (input: { description: string }) =>
      api.post<{ questions: ClarifyQuestion[] }>('/agents/clarify', input),
  })
}
```

Update `useDryRunAgent` to the new shape:

```ts
/** `POST /agents/dry-run` — honest preview (shared pipeline). */
export function useDryRunAgent() {
  return useMutation({
    mutationFn: (input: { plan: AgentPlan }) => api.post<DryRunResult>('/agents/dry-run', input),
  })
}
```

Update `useCompileAgent` to accept optional answers:

```ts
export function useCompileAgent() {
  return useMutation({
    mutationFn: (input: { description: string; answers?: ClarifyAnswer[] }) =>
      api.post<AgentPlan>('/agents/compile', input),
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @revido/web exec tsc --noEmit`
Expected: no errors (`answers` optional keeps existing call sites valid).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/hooks/agents.ts
git commit -m "feat(web): clarify hook + typed dry-run result + compile answers"
```

---

## Task 9: Add the Refine (clarify) wizard step

**Files:**
- Modify: `apps/web/src/components/agents/create-agent-dialog.tsx`

- [ ] **Step 1: Add the step to the flow**

```ts
type Step = 'describe' | 'refine' | 'plan' | 'dryrun' | 'name'

const STEPS: { id: Step; label: string }[] = [
  { id: 'describe', label: 'Describe' },
  { id: 'refine', label: 'Refine' },
  { id: 'plan', label: 'Plan' },
  { id: 'dryrun', label: 'Dry-run' },
  { id: 'name', label: 'Enable' },
]
```

- [ ] **Step 2: Import the hook + types**

```ts
import { useClarifyAgent, type ClarifyQuestion, type ClarifyAnswer } from '@/lib/hooks/agents'
```

- [ ] **Step 3: Add clarify state + fetch in `WizardBody`**

```ts
  const clarify = useClarifyAgent()
  const [questions, setQuestions] = React.useState<ClarifyQuestion[]>([])
  // answerState: questionId → selected option ids (seeded from the model's defaults).
  const [answerState, setAnswerState] = React.useState<Record<string, string[]>>({})

  async function fetchClarify() {
    try {
      const { questions } = await clarify.mutateAsync({ description })
      setQuestions(questions)
      setAnswerState(Object.fromEntries(questions.map((q) => [q.id, q.defaultOptionIds])))
      if (questions.length === 0) {
        await compileAndAdvance() // nothing to ask → compile straight away
      } else {
        setStep('refine')
      }
    } catch {
      await compileAndAdvance() // clarify failed → skip refinement
    }
  }

  function selectedAnswers(): ClarifyAnswer[] {
    return questions.map((q) => ({
      question: q.question,
      answer: (answerState[q.id] ?? [])
        .map((id) => q.options.find((o) => o.id === id)?.label)
        .filter(Boolean)
        .join(', '),
    }))
  }
```

- [ ] **Step 4: Thread answers into compile**

In `compileAndAdvance`, change the compile call:

```ts
      const compiled = await compile.mutateAsync({ description, answers: selectedAnswers() })
```

- [ ] **Step 5: Render the Refine step**

In the body switch, before the `plan` block:

```tsx
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
```

- [ ] **Step 6: Wire footer navigation**

Change the `describe` primary button to call `fetchClarify` with label `Continue`:

```tsx
        {step === 'describe' && (
          <Button variant="ai" onClick={fetchClarify} disabled={description.trim().length < 4 || clarify.isPending}>
            <Sparkles /> {clarify.isPending ? 'Thinking…' : 'Continue'}
          </Button>
        )}
```

Add a `refine` footer button that runs compile:

```tsx
        {step === 'refine' && (
          <Button variant="ai" onClick={compileAndAdvance} disabled={compile.isPending}>
            <Sparkles /> {compile.isPending ? 'Compiling…' : 'Compile plan'}
          </Button>
        )}
```

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @revido/web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/agents/create-agent-dialog.tsx
git commit -m "feat(web): interactive Refine step — pre-answered clarifying questions"
```

---

## Task 10: Server dry-run + honest DryRun UI

**Files:**
- Modify: `apps/web/src/components/agents/create-agent-dialog.tsx`

- [ ] **Step 1: Replace client-side category filtering with the server dry-run**

Remove the `useThreadsByCategory` + `matches` memo (~lines 136–141) and add:

```ts
  const dryRun = useDryRunAgent()
  const [dryRunResult, setDryRunResult] = React.useState<DryRunResult | null>(null)

  async function runDryRun() {
    setStep('dryrun')
    try {
      setDryRunResult(await dryRun.mutateAsync({ plan: submitPlan() }))
    } catch {
      setDryRunResult(null)
    }
  }
```

Update imports:

```ts
import { useDryRunAgent, type DryRunResult } from '@/lib/hooks/agents'
```

Remove the now-unused `useThreadsByCategory` import (if nothing else uses it). Leave `compile.ts` exports intact — the offline fallback compiler still uses `plan.matchLabel`/`plan.category`.

- [ ] **Step 2: Point the `plan` footer button at `runDryRun`**

```tsx
        {step === 'plan' && (
          <Button onClick={runDryRun}>
            <FlaskConical /> Dry-run on history
          </Button>
        )}
```

- [ ] **Step 3: Rewrite the `DryRun` component + call site**

Call site:

```tsx
        {step === 'dryrun' && <DryRun result={dryRunResult} loading={dryRun.isPending} />}
```

Component (replaces the existing `DryRun`):

```tsx
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
              {matched.map((t) => (
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
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm --filter @revido/web exec tsc --noEmit && pnpm --filter @revido/web build`
Expected: no type errors; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/agents/create-agent-dialog.tsx
git commit -m "feat(web): honest server dry-run — confirmed matches + free-excluded count"
```
