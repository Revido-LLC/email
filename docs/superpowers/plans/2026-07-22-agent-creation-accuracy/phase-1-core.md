# Phase 1 — Core matching foundation (pure, no deps)

Foundational, pure TypeScript in `@revido/core`. Tasks 1 and 2 touch disjoint files (may run in parallel); Task 3 depends on both.

**Phase verification gate:** `pnpm --filter @revido/core test` — all green.

---

## Task 1: Deterministic content pre-filter

**Files:**
- Create: `packages/core/src/content-prefilter.ts`
- Test: `packages/core/src/content-prefilter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/content-prefilter.test.ts
import { describe, expect, it } from 'vitest'
import { detectDocType, prefilterVerdict } from './content-prefilter'

describe('detectDocType', () => {
  it('detects receipt / invoice / contract / shipping, else generic', () => {
    expect(detectDocType('a receipt for a completed payment')).toBe('receipt')
    expect(detectDocType('an invoice or bill')).toBe('invoice')
    expect(detectDocType('a signed contract or agreement')).toBe('contract')
    expect(detectDocType('a shipping or tracking notification')).toBe('shipping')
    expect(detectDocType('anything unusual')).toBe('generic')
  })
})

describe('prefilterVerdict (receipt)', () => {
  const receipt = 'receipt' as const
  // The four real dry-run false-positives from the bug report MUST all be excluded.
  it.each([
    '[FINAL NOTICE] Update your payment information - Account downgrade imminent',
    'ARIN Annual Fees Reminder Notice_60 Days Past Due_for Inv# SI539010',
    "URGENT: Your Twilio account couldn't be recharged",
    'Your Browserstack account has been suspended due to payment failures.',
  ])('excludes dunning subject: %s', (subject) => {
    expect(prefilterVerdict({ subject, snippet: '' }, receipt)).toBe('exclude')
  })

  it('passes a real receipt subject to the AI classifier', () => {
    expect(prefilterVerdict({ subject: 'Your receipt from Acme — payment received', snippet: '' }, receipt)).toBe('pass')
  })

  it('matches exclusion phrases in the snippet, case-insensitively', () => {
    expect(prefilterVerdict({ subject: 'Invoice 42', snippet: 'This account is PAST DUE.' }, receipt)).toBe('exclude')
  })
})

describe('prefilterVerdict (generic)', () => {
  it('always passes generic doc types (no regression for non-receipt agents)', () => {
    expect(prefilterVerdict({ subject: 'anything', snippet: 'final notice' }, 'generic')).toBe('pass')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @revido/core exec vitest run src/content-prefilter.test.ts`
Expected: FAIL — cannot find module `./content-prefilter`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/content-prefilter.ts
/**
 * Deterministic, LLM-free content pre-filter — the free first gate of the hybrid
 * agent-matching pipeline. Given a `content` clause's natural-language value we
 * detect a document type and, from cheap thread text (subject + snippet), decide
 * whether a candidate is worth the paid AI classifier at all. A hard `exclude`
 * drops dunning / payment-failure / phishing mail that shares the billing category
 * with real receipts, so it is never classified and never forwarded. Unknown
 * ('generic') doc types always `pass` (today's behaviour), so non-receipt agents
 * are unchanged.
 */

export type DocType = 'receipt' | 'invoice' | 'contract' | 'shipping' | 'generic'
export type PrefilterVerdict = 'exclude' | 'pass'

/** Cheap, metadata-only text signals (already-decrypted subject + optional snippet). */
export interface PrefilterSignals {
  subject: string
  snippet: string
}

/** Dunning / payment-failure / account-jeopardy phrases — the opposite of a receipt. */
const DUNNING = [
  'past due',
  'past-due',
  'overdue',
  'final notice',
  'suspended',
  'suspend',
  "couldn't be charged",
  'could not be charged',
  'couldn’t be charged',
  'payment failed',
  'failed payment',
  'payment failure',
  'declined',
  'action required',
  'update your payment',
  'update your billing',
  'unpaid',
  'reminder to pay',
  'downgrade',
  'recharge',
  'late payment',
  'billing problem',
]

interface DocTypeRule {
  /** Lower-case phrases in subject/snippet that HARD-exclude the thread. */
  exclude: string[]
}

const REGISTRY: Record<Exclude<DocType, 'generic'>, DocTypeRule> = {
  receipt: { exclude: DUNNING },
  // An invoice legitimately states an amount due; only outright failure/jeopardy excludes.
  invoice: {
    exclude: ['final notice', 'suspended', 'account suspended', 'payment failed', 'declined'],
  },
  contract: { exclude: [] },
  shipping: { exclude: [] },
}

const DETECT: { type: Exclude<DocType, 'generic'>; keys: string[] }[] = [
  { type: 'receipt', keys: ['receipt', 'payment', 'purchase', 'order confirmation'] },
  { type: 'invoice', keys: ['invoice', 'bill', 'amount due', 'statement'] },
  { type: 'contract', keys: ['contract', 'agreement', 'signed', 'signature'] },
  { type: 'shipping', keys: ['shipping', 'shipment', 'tracking', 'delivery', 'shipped'] },
]

/** Detect a known document type from a content-clause value, else 'generic'. */
export function detectDocType(clauseValue: string): DocType {
  const v = clauseValue.toLowerCase()
  for (const { type, keys } of DETECT) {
    if (keys.some((k) => v.includes(k))) return type
  }
  return 'generic'
}

/** Free verdict: 'exclude' hard-drops a candidate; 'pass' sends it to the AI classifier. */
export function prefilterVerdict(signals: PrefilterSignals, docType: DocType): PrefilterVerdict {
  if (docType === 'generic') return 'pass'
  const haystack = `${signals.subject}\n${signals.snippet}`.toLowerCase()
  return REGISTRY[docType].exclude.some((phrase) => haystack.includes(phrase)) ? 'exclude' : 'pass'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @revido/core exec vitest run src/content-prefilter.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/content-prefilter.ts packages/core/src/content-prefilter.test.ts
git commit -m "feat(core): deterministic receipt-vs-dunning content pre-filter"
```

---

## Task 2: Shared content-evaluation planner

**Files:**
- Create: `packages/core/src/content-eval.ts`
- Test: `packages/core/src/content-eval.test.ts`

Depends on Task 1 and existing `agent-plan.ts` (`compilePredicate`, `contentClauses`, `AgentPlan`).

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/content-eval.test.ts
import { describe, expect, it } from 'vitest'
import type { Thread } from '@revido/db'
import type { AgentPlan } from './agent-plan'
import { planContentEvaluation } from './content-eval'

/** Minimal Thread factory — only the fields the planner reads. */
function thread(over: Partial<Thread>): Thread {
  return {
    id: 'id',
    accountId: 'acc',
    subject: 'Subject',
    participants: [],
    category: 'receipts',
    priority: 'normal',
    priorityScore: 50,
    tldr: '',
    summary: '',
    unread: false,
    starred: false,
    snoozedUntil: null,
    hasAttachments: false,
    badges: [],
    extracted: [],
    messageIds: ['m1'],
    lastMessageAt: '2026-07-01T00:00:00.000Z',
    awaitingReply: false,
    labels: [],
    ...over,
  } as Thread
}

const receiptPlan: AgentPlan = {
  trigger: 'new-mail',
  conditions: [
    { field: 'category', op: 'is', value: 'receipts' },
    { field: 'content', op: 'is', value: 'a receipt for a completed payment' },
  ],
  actions: [{ type: 'forward', label: 'Forward to accounting', params: { to: 'a@b.co' } }],
}

describe('planContentEvaluation', () => {
  it('hard-excludes dunning candidates for free and passes plausible ones to AI', () => {
    const threads = [
      thread({ id: 'good', subject: 'Your receipt from Acme' }),
      thread({ id: 'dunning', subject: 'FINAL NOTICE: update your payment' }),
      thread({ id: 'other', subject: 'Receipt', category: 'to-reply' }), // fails metadata gate
    ]
    const r = planContentEvaluation(receiptPlan, threads)
    expect(r.needsAi.map((t) => t.id)).toEqual(['good'])
    expect(r.excluded.map((e) => e.thread.id)).toEqual(['dunning'])
    expect(r.autoMatched).toEqual([]) // content clause present ⇒ nothing auto-matches
  })

  it('auto-matches on metadata alone when there is no content clause', () => {
    const metaOnly: AgentPlan = {
      trigger: 'new-mail',
      conditions: [{ field: 'category', op: 'is', value: 'receipts' }],
      actions: [{ type: 'label', label: 'Label' }],
    }
    const threads = [thread({ id: 'a' }), thread({ id: 'b', category: 'to-reply' })]
    const r = planContentEvaluation(metaOnly, threads)
    expect(r.autoMatched.map((t) => t.id)).toEqual(['a'])
    expect(r.needsAi).toEqual([])
    expect(r.excluded).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @revido/core exec vitest run src/content-eval.test.ts`
Expected: FAIL — cannot find module `./content-eval`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/content-eval.ts
/**
 * Shared content-evaluation planner — the single partitioning step both the
 * server dry-run and the worker run so the preview can never diverge from
 * runtime. Applies the metadata predicate, then the free pre-filter over any
 * `content` clauses, splitting candidates into: `autoMatched` (no content clause
 * — metadata alone decides), `needsAi` (passed metadata + pre-filter, still need
 * the paid classifier), and `excluded` (hard-dropped by the pre-filter). Pure:
 * the LLM lives in the caller.
 */
import type { Thread } from '@revido/db'
import { compilePredicate, contentClauses, type AgentPlan } from './agent-plan'
import { detectDocType, prefilterVerdict } from './content-prefilter'

export interface ExcludedThread {
  thread: Thread
  reason: string
}

export interface ContentEvaluation {
  autoMatched: Thread[]
  needsAi: Thread[]
  excluded: ExcludedThread[]
}

const EXCLUDE_REASON = 'Billing/past-due notice — not the document requested'

export function planContentEvaluation(plan: AgentPlan, threads: Thread[]): ContentEvaluation {
  const predicate = compilePredicate(plan)
  const candidates = threads.filter(predicate)
  const clauses = contentClauses(plan)
  if (clauses.length === 0) {
    return { autoMatched: candidates, needsAi: [], excluded: [] }
  }
  const docTypes = clauses.map((c) => detectDocType(c.value))
  const autoMatched: Thread[] = []
  const needsAi: Thread[] = []
  const excluded: ExcludedThread[] = []
  for (const thread of candidates) {
    const signals = { subject: thread.subject, snippet: thread.tldr }
    const drop = docTypes.some((dt) => prefilterVerdict(signals, dt) === 'exclude')
    if (drop) excluded.push({ thread, reason: EXCLUDE_REASON })
    else needsAi.push(thread)
  }
  return { autoMatched, needsAi, excluded }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @revido/core exec vitest run src/content-eval.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/content-eval.ts packages/core/src/content-eval.test.ts
git commit -m "feat(core): shared planContentEvaluation partitions candidates"
```

---

## Task 3: Export the new core modules

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add the exports**

In `packages/core/src/index.ts`, after `export * from './agent-plan'`, add:

```ts
export * from './content-prefilter'
export * from './content-eval'
```

- [ ] **Step 2: Typecheck the package**

Run: `pnpm --filter @revido/core exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "chore(core): export content-prefilter + content-eval"
```
