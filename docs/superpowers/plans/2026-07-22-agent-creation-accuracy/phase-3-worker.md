# Phase 3 — Worker: one pipeline for runtime

Make the worker use the same `planContentEvaluation` so runtime matches the preview and dunning candidates are dropped for free. Depends on Phase 1.

**Phase verification gate:** `pnpm --filter @revido/worker test` — all green.

---

## Task 7: `agent-run` uses `planContentEvaluation`

**Files:**
- Modify: `apps/worker/src/consumers/agent-run.ts`
- Test: `apps/worker/src/consumers/agent-run.test.ts`

- [ ] **Step 1: Write/extend the failing test**

Add a case proving a dunning candidate is dropped **without** an LLM/getThread call. Reuse the file's existing fake-store/deps builder and agent-plan/thread fixtures; the key assertion is that the classifier path never runs for a dunning subject.

```ts
it('pre-filter drops dunning candidates for free (no classifier call)', async () => {
  let classifyCalls = 0
  // Build deps whose getThread increments classifyCalls (the classifier calls it).
  const deps = makeDeps({
    getThread: async () => {
      classifyCalls += 1
      return {
        subject: 's',
        messages: [{ from: { name: '', email: '' }, date: '', body: 'x', outbound: false }],
        priority: 'normal',
        outputLanguage: 'match',
        detectedLanguage: null,
      }
    },
  })
  // Agent plan: category is receipts + content is "a receipt for a completed payment".
  // Seed ONE candidate thread whose subject is "FINAL NOTICE: update your payment"
  // (category receipts). It passes metadata but the pre-filter excludes it → no classify.
  await runConsumer(deps, { userId: 'u1', agentId: 'a1', threadIds: ['t-dunning'] })
  expect(classifyCalls).toBe(0)
})
```

> **Note:** match the exact `makeDeps`/`runConsumer` names and fixture builders already in `agent-run.test.ts`. The plan the fake `getAgentPlan` returns must include both the `category is receipts` and `content is "a receipt for a completed payment"` clauses, and the seeded thread must have `category: 'receipts'` with the dunning subject.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @revido/worker exec vitest run src/consumers/agent-run.test.ts`
Expected: FAIL — current code classifies every candidate, so `classifyCalls` > 0.

- [ ] **Step 3: Refactor to the shared planner**

Update the `@revido/core` import to add `planContentEvaluation` (keep `contentClauses`, `buildContentClassifierPrompt`, `CONTENT_CLASSIFIER_SCHEMA`, `actionNeedsApproval`, `forwardDestination`, and the types):

```ts
import {
  actionNeedsApproval,
  buildContentClassifierPrompt,
  contentClauses,
  CONTENT_CLASSIFIER_SCHEMA,
  forwardDestination,
  planContentEvaluation,
  type AgentCondition,
  type CompiledAgentAction,
  type LlmThinking,
} from '@revido/core'
```

Replace the candidate/classify block (currently ~lines 105–120):

```ts
    const threads = await deps.mail.listAgentThreads(userId, user.crypto, { threadIds })
    const predicate = compilePredicate(plan)
    const candidates = threads.filter(predicate)
    if (candidates.length === 0) return

    const clauses = contentClauses(plan)
    const matched: Thread[] = []
    for (const thread of candidates) {
      if (clauses.length === 0 || (await classifyThreadContent(deps, user, thread, clauses))) {
        matched.push(thread)
      }
    }
    if (matched.length === 0) return
```

with:

```ts
    const threads = await deps.mail.listAgentThreads(userId, user.crypto, { threadIds })
    const { autoMatched, needsAi } = planContentEvaluation(plan, threads)
    const clauses = contentClauses(plan)
    const matched: Thread[] = [...autoMatched]
    for (const thread of needsAi) {
      if (await classifyThreadContent(deps, user, thread, clauses)) matched.push(thread)
    }
    if (matched.length === 0) return
```

Remove the now-unused `compilePredicate` import if nothing else in the file uses it. Keep the existing `classifyThreadContent` helper unchanged. Net effect: dunning candidates never reach `classifyThreadContent`, so no LLM call and no forward.

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm --filter @revido/worker exec vitest run src/consumers/agent-run.test.ts && pnpm --filter @revido/worker exec tsc --noEmit`
Expected: PASS + no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/consumers/agent-run.ts apps/worker/src/consumers/agent-run.test.ts
git commit -m "refactor(worker): agent-run shares planContentEvaluation (free dunning drop)"
```
