# Phase 2 — API: clarify, compile answers, honest dry-run

All three tasks modify `apps/api/src/routes/agents-ai.ts`; run them **sequentially** (shared file). Task 4 also touches `apps/api/src/lib/metering.ts`. Depends on Phase 1.

**Phase verification gate:** `pnpm --filter @revido/api test` — all green.

**Test harness note:** these tests use `agents-ai.test.ts`. If the file/harness doesn't exist, build a minimal one: mount `agentsAiRouter` on `new Hono()`, add a middleware setting `c.set('userId', 'u1')` BEFORE the router, and call `app.request('/<path>', { method: 'POST', body: JSON.stringify(input), headers: { 'content-type': 'application/json' } })`. Inject a fake LLM via `setLlmClient` from `../lib/ai`; reset with `setLlmClient(undefined)` in `afterEach`. `callClarify`/`callCompile`/`callDryRun` are thin wrappers over that.

---

## Task 4: `POST /agents/clarify` — grounded, pre-answered questions

**Files:**
- Modify: `apps/api/src/lib/metering.ts`
- Modify: `apps/api/src/routes/agents-ai.ts`
- Test: `apps/api/src/routes/agents-ai.test.ts`

- [ ] **Step 1: Add the metering metric**

In `apps/api/src/lib/metering.ts`, add to `UsageMetric` (after `agentCompiles`):

```ts
  agentClarifies: 'ai_clarifies',
```

and to `CAP_CONFIG`:

```ts
  [UsageMetric.agentClarifies]: { env: 'AI_MONTHLY_CAP_CLARIFIES', fallback: 300 },
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it, afterEach } from 'vitest'
import type { LlmClient } from '@revido/core'
import { setLlmClient } from '../lib/ai'

function fakeLlm(json: unknown): LlmClient {
  return {
    async complete() {
      return { text: '', json, usage: { inputTokens: 10, outputTokens: 10 } }
    },
  } as unknown as LlmClient
}

afterEach(() => setLlmClient(undefined))

describe('POST /agents/clarify', () => {
  it('returns ≤3 pre-answered questions', async () => {
    setLlmClient(
      fakeLlm({
        questions: [
          {
            id: 'attachments',
            question: 'Only messages with an attachment?',
            options: [
              { id: 'yes', label: 'Only with an attachment' },
              { id: 'any', label: 'Any message' },
            ],
            multi: false,
            defaultOptionIds: ['yes'],
          },
        ],
      }),
    )
    const res = await callClarify({ description: 'forward every receipt to accounting' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.questions.length).toBeLessThanOrEqual(3)
    expect(body.questions[0].defaultOptionIds).toEqual(['yes'])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @revido/api exec vitest run src/routes/agents-ai.test.ts`
Expected: FAIL — `/clarify` returns 404.

- [ ] **Step 4: Implement the route**

In `apps/api/src/routes/agents-ai.ts` add constants near the top:

```ts
const CLARIFY_MAX_TOKENS = 512
const CLARIFY_MAX_QUESTIONS = 3
```

Add the JSON schema near `AGENT_PLAN_JSON_SCHEMA`:

```ts
/** Structured-output constraint for the clarify step. */
export const CLARIFY_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      maxItems: CLARIFY_MAX_QUESTIONS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'question', 'options', 'multi', 'defaultOptionIds'],
        properties: {
          id: { type: 'string' },
          question: { type: 'string' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'label'],
              properties: { id: { type: 'string' }, label: { type: 'string' } },
            },
          },
          multi: { type: 'boolean' },
          defaultOptionIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

export const CLARIFY_SYSTEM = `You help a Revido Mail user turn a rough inbox-automation idea into a precise rule by asking at most ${CLARIFY_MAX_QUESTIONS} short, high-value multiple-choice questions. Only ask about real matching levers the system can honour: whether to require an attachment; which senders or domains; the exact category; whether an amount must be present; forward automatically vs. hold each for one-tap approval; and — when the rule names a document type like "receipt" — what counts (e.g. real receipts only vs. also invoices, bills, and past-due/failed-payment notices). For EACH question give 2–4 options and PRE-SELECT your single best-guess default in "defaultOptionIds" (one id, unless "multi" is true) so the user can just click through. Never ask about anything the rule already makes explicit. Return ONLY the JSON object.`
```

Add the Zod validator near `dryRunSchema`:

```ts
const clarifySchema = z.object({ description: z.string().min(1) })
const clarifyResponseSchema = z.object({
  questions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      options: z.array(z.object({ id: z.string(), label: z.string() })),
      multi: z.boolean(),
      defaultOptionIds: z.array(z.string()),
    }),
  ),
})
```

Add the route after `/compile`:

```ts
/** POST /agents/clarify — grounded, pre-answered refining questions (cheap model). */
agentsAiRouter.post('/clarify', async (c) => {
  const userId = c.get('userId')
  const { description } = await readJson(c, clarifySchema)
  await enforceAiCap(userId, UsageMetric.agentClarifies)

  const result = await getLlmClient().complete({
    model: 'summary',
    system: CLARIFY_SYSTEM,
    messages: [{ role: 'user', content: `The user's rule idea:\n\n${description}` }],
    maxTokens: CLARIFY_MAX_TOKENS,
    responseFormat: { type: 'json', schema: CLARIFY_JSON_SCHEMA },
    userId,
  })

  const parsed = clarifyResponseSchema.safeParse(result.json)
  // Graceful degradation: a bad/empty result simply skips the step (no questions).
  const questions = parsed.success ? parsed.data.questions.slice(0, CLARIFY_MAX_QUESTIONS) : []
  await recordAiUsage(userId, UsageMetric.agentClarifies)
  return c.json({ questions })
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @revido/api exec vitest run src/routes/agents-ai.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/metering.ts apps/api/src/routes/agents-ai.ts apps/api/src/routes/agents-ai.test.ts
git commit -m "feat(api): /agents/clarify — grounded, pre-answered refining questions"
```

---

## Task 5: `/agents/compile` folds in clarify answers

**Files:**
- Modify: `apps/api/src/routes/agents-ai.ts`
- Test: `apps/api/src/routes/agents-ai.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('POST /agents/compile with answers', () => {
  it('folds clarify answers into the model prompt', async () => {
    let seenUserContent = ''
    setLlmClient({
      async complete(req: { messages: { role: string; content: string }[] }) {
        seenUserContent = req.messages.map((m) => m.content).join('\n')
        return {
          text: '',
          json: {
            trigger: 'new-mail',
            conditions: [{ field: 'hasAttachments', op: 'is', value: 'true' }],
            actions: [{ type: 'forward', label: 'Forward', params: { to: 'a@b.co' } }],
          },
          usage: { inputTokens: 1, outputTokens: 1 },
        }
      },
    } as unknown as LlmClient)

    const res = await callCompile({
      description: 'forward every receipt',
      answers: [{ question: 'Only with an attachment?', answer: 'Only with an attachment' }],
    })
    expect(res.status).toBe(200)
    expect(seenUserContent).toContain('Only with an attachment')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @revido/api exec vitest run src/routes/agents-ai.test.ts`
Expected: FAIL — answers ignored or schema rejects `answers`.

- [ ] **Step 3: Implement**

Widen `compileSchema`:

```ts
const compileSchema = z.object({
  description: z.string().min(1),
  answers: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
})
```

In the `/compile` handler, build user content from description + answers:

```ts
  const { description, answers } = await readJson(c, compileSchema)
  await enforceAiCap(userId, UsageMetric.agentCompiles)

  const clarifications =
    answers && answers.length
      ? `\n\nThe user answered these clarifying questions — honour them:\n` +
        answers.map((a) => `- ${a.question} → ${a.answer}`).join('\n')
      : ''

  const result = await getLlmClient().complete({
    model: 'escalation',
    system: COMPILE_SYSTEM,
    messages: [
      { role: 'user', content: `Compile this inbox rule into an agent plan:\n\n${description}${clarifications}` },
    ],
    maxTokens: COMPILE_MAX_TOKENS,
    responseFormat: { type: 'json', schema: AGENT_PLAN_JSON_SCHEMA },
    userId,
  })
```

Sharpen `COMPILE_SYSTEM`: in the `content` field paragraph, append:

```
For a "receipt" rule, phrase the content value as "a receipt for a completed payment — exclude invoices, bills, and past-due or failed-payment notices", and pair it with the cheapest metadata gate the user implied (e.g. hasAttachments is true).
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @revido/api exec vitest run src/routes/agents-ai.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/agents-ai.ts apps/api/src/routes/agents-ai.test.ts
git commit -m "feat(api): compile folds clarify answers + sharpens receipt guidance"
```

---

## Task 6: Rewrite `/agents/dry-run` — shared pipeline, capped AI, honest counts

**Files:**
- Modify: `apps/api/src/routes/agents-ai.ts`
- Test: `apps/api/src/routes/agents-ai.test.ts`

Uses `planContentEvaluation` (core), `loadThreadForPrompt` (`apps/api/src/lib/ai-context.ts`, signature `loadThreadForPrompt(tx, crypto, threadId) → Promise<ThreadForPrompt | undefined>` exposing `.thread` + `.messages`), and `buildContentClassifierPrompt` / `CONTENT_CLASSIFIER_SCHEMA` (core).

- [ ] **Step 1: Write the failing test**

```ts
describe('POST /agents/dry-run', () => {
  it('excludes dunning for free and reports honest counts', async () => {
    // Seed three threads for the test user via the file's thread-seeding harness:
    // a real receipt, a dunning notice ("FINAL NOTICE …"), and an off-category thread.
    setLlmClient(fakeLlm({ match: true })) // classifier confirms the sampled candidate
    const res = await callDryRun({
      plan: {
        trigger: 'new-mail',
        conditions: [
          { field: 'category', op: 'is', value: 'receipts' },
          { field: 'content', op: 'is', value: 'a receipt for a completed payment' },
        ],
        actions: [{ type: 'forward', label: 'Forward', params: { to: 'a@b.co' } }],
      },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.excludedCount).toBeGreaterThanOrEqual(1) // the dunning notice
    expect(body.matched.length).toBeGreaterThanOrEqual(1) // the real receipt
    expect(typeof body.estimatedMatches).toBe('number')
    expect(typeof body.candidateCount).toBe('number')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @revido/api exec vitest run src/routes/agents-ai.test.ts`
Expected: FAIL — old handler returns `{ matches }`, not `{ matched, excludedCount, ... }`.

- [ ] **Step 3: Implement the rewrite**

Add/extend imports:

```ts
import { AGENT_ACTION_TYPES, agentPlanSchema, compilePredicate, contentClauses } from '@revido/core/agent-plan'
import {
  buildContentClassifierPrompt,
  CONTENT_CLASSIFIER_SCHEMA,
  planContentEvaluation,
} from '@revido/core'
import { loadThreadForPrompt } from '../lib/ai-context'
```

Add a constant:

```ts
const PREVIEW_AI_CAP = 10
```

Replace the whole `/dry-run` handler:

```ts
/** POST /agents/dry-run — shared pipeline preview over the last 30 days. */
agentsAiRouter.post('/dry-run', async (c) => {
  const userId = c.get('userId')
  const { plan } = await readJson(c, dryRunSchema)
  const crypto = await getUserCrypto(userId)
  const since = new Date(Date.now() - THIRTY_DAYS_MS)
  const llm = getLlmClient()

  const body = await withUser(userId, async (tx) => {
    const rows = await tx
      .select()
      .from(threads)
      .where(gte(threads.lastMessageAt, since))
      .orderBy(desc(threads.lastMessageAt))
    const assembled = await assembleThreads(tx, crypto, rows)

    const evaluated = planContentEvaluation(plan, assembled)
    const matched = [...evaluated.autoMatched]

    const clause = contentClauses(plan)[0]?.value ?? ''
    const sample = evaluated.needsAi.slice(0, PREVIEW_AI_CAP)
    let hits = 0
    for (const thread of sample) {
      if (await classifyOne(tx, crypto, llm, userId, thread.id, clause)) {
        matched.push(thread)
        hits += 1
      }
    }

    const sampledCount = sample.length
    const remaining = evaluated.needsAi.length - sampledCount
    const rate = sampledCount > 0 ? hits / sampledCount : 0
    const estimatedMatches = matched.length + Math.round(remaining * rate)

    const reasonCounts = new Map<string, number>()
    for (const e of evaluated.excluded) {
      reasonCounts.set(e.reason, (reasonCounts.get(e.reason) ?? 0) + 1)
    }

    return {
      matched,
      candidateCount:
        evaluated.autoMatched.length + evaluated.needsAi.length + evaluated.excluded.length,
      excludedCount: evaluated.excluded.length,
      excludedReasons: [...reasonCounts].map(([label, count]) => ({ label, count })),
      sampledCount,
      estimatedMatches,
    }
  })

  return c.json(body)
})

/** Classify one thread against a content predicate; fail-closed (any error ⇒ false). */
async function classifyOne(
  tx: Parameters<Parameters<typeof withUser>[1]>[0],
  crypto: Awaited<ReturnType<typeof getUserCrypto>>,
  llm: ReturnType<typeof getLlmClient>,
  userId: string,
  threadId: string,
  predicate: string,
): Promise<boolean> {
  if (!predicate) return true
  try {
    const loaded = await loadThreadForPrompt(tx, crypto, threadId)
    if (!loaded || loaded.messages.length === 0) return false
    const text = [loaded.thread.subject, ...loaded.messages.map((m) => m.text || m.html || '')]
      .join('\n\n')
      .trim()
    if (!text) return false
    const prompt = buildContentClassifierPrompt(text, predicate)
    const result = await llm.complete({
      model: 'triage',
      system: prompt.system,
      messages: prompt.messages,
      maxTokens: 64,
      responseFormat: { type: 'json', schema: CONTENT_CLASSIFIER_SCHEMA },
      userId,
    })
    return (result.json as { match?: unknown } | undefined)?.match === true
  } catch {
    return false
  }
}
```

> **Type note:** if the inline `Parameters<...>` tx type is awkward, define `type Tx = Parameters<Parameters<typeof withUser>[1]>[0]` and use it. Confirm `loadThreadForPrompt`'s arg order against `ai-context.ts` and that `.messages[].text`/`.html` exist on the returned `Message`.

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm --filter @revido/api exec vitest run src/routes/agents-ai.test.ts && pnpm --filter @revido/api exec tsc --noEmit`
Expected: PASS + no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/agents-ai.ts apps/api/src/routes/agents-ai.test.ts
git commit -m "feat(api): dry-run uses shared pipeline — free pre-filter + capped honest counts"
```
