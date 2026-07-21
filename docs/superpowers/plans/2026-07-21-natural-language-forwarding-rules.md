# Natural-language Forwarding Rules — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans or subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** Let users create plain-English forwarding rules ("forward invoices/receipts to accounting@revido.co") that auto-forward matching mail (with attachments), completing the existing inbox-agents framework.

**Architecture:** Reuse `agents`/`agent_actions`/`agent_runs`/`approvals` + the NL compiler (`/agents/compile`, Opus) + the `send` consumer (10s undo). Add: forward destination capture, a hybrid content-classification condition (cheap structured predicate gates a per-candidate AI check), a forward executor, and an opt-in `trusted` auto-run flag.

**Tech Stack:** TypeScript, Drizzle + raw SQL migrations, Hono API, Postgres-queue worker, Vitest, OpenRouter LLM seam, React/TanStack (web).

---

## File map

- `packages/db/drizzle/0006_agent_forwarding.sql` — migration (create)
- `packages/db/src/schema/agents.ts` — `agent_actions.params`, `agents.trusted`, `approvals.params` (modify)
- `packages/core/src/agent-plan.ts` — content-clause split, forward-destination helpers (modify)
- `packages/core/src/prompt-builders/content-classifier.ts` — classifier prompt + runner (create)
- `packages/core/src/index.ts` — export new symbols (modify)
- `apps/api/src/routes/agents-ai.ts` — compile prompt: `content` field + forward `params.to` (modify)
- `apps/api/src/routes/agents.ts` — persist `params` + `trusted` (modify)
- `apps/api/src/routes/approvals.ts` — execute forward on approve (modify)
- `apps/worker/src/mail/store.ts` + `pg-store.ts` — `reconstructPlan` params, `trusted` in plan, `forwardMessage` (modify)
- `apps/worker/src/consumers/agent-run.ts` — two-stage eval + trusted-forward routing (modify)
- Co-located `*.test.ts` for each.

---

## Task 1: Migration + schema

**Files:** Create `packages/db/drizzle/0006_agent_forwarding.sql`; Modify `packages/db/src/schema/agents.ts`.

- [ ] **Step 1: Write the migration** (idempotent, additive)

```sql
ALTER TABLE agent_actions ADD COLUMN IF NOT EXISTS params jsonb;
--> statement-breakpoint
ALTER TABLE agents ADD COLUMN IF NOT EXISTS trusted boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS params jsonb;
--> statement-breakpoint
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS message_id uuid;
```

- [ ] **Step 2: Add columns to drizzle schema** — `agents.trusted: boolean('trusted').notNull().default(false)`; `agentActions.params: jsonb('params').$type<Record<string,string>>()`; `approvals.params: jsonb('params').$type<Record<string,string>>()`, `approvals.messageId: uuid('message_id')`. Import `jsonb` if not present.
- [ ] **Step 3: Regenerate types** — `pnpm --filter @revido/db build` (or the sync-schema flow). Expected: no type errors.
- [ ] **Step 4: Commit** — `feat(db): forwarding-rule columns (agent_actions.params, agents.trusted, approvals.params/message_id)`

## Task 2: Core — content-clause split + forward-destination helpers

**Files:** Modify `packages/core/src/agent-plan.ts`; Test `packages/core/src/agent-plan.test.ts`.

- [ ] **Step 1: Failing tests**

```ts
import { compilePredicate, contentClauses, forwardDestination, CONTENT_FIELD } from './agent-plan'
// content clause is ignored by the structured predicate (defer to AI stage)
it('compilePredicate treats a content clause as pass-through', () => {
  const plan = { trigger: 'new-mail', conditions: [{ field: 'content', op: 'is', value: 'an invoice' }], actions: [] } as const
  expect(compilePredicate(plan as any)(threadFixture())).toBe(true)
})
it('contentClauses extracts only content-field conditions', () => {
  const plan = { trigger: 'new-mail', conditions: [{ field: 'content', op: 'is', value: 'an invoice' }, { field: 'category', op: 'is', value: 'receipts' }], actions: [] } as const
  expect(contentClauses(plan as any)).toEqual([{ field: 'content', op: 'is', value: 'an invoice' }])
})
it('forwardDestination returns params.to for a forward action', () => {
  expect(forwardDestination({ type: 'forward', label: 'fwd', params: { to: 'a@b.com' } })).toBe('a@b.com')
  expect(forwardDestination({ type: 'forward', label: 'fwd' })).toBeNull()
})
```

- [ ] **Step 2: Run — expect FAIL** (`contentClauses`/`forwardDestination` not exported).
- [ ] **Step 3: Implement** in `agent-plan.ts`:

```ts
export const CONTENT_FIELD = 'content'
export function isContentClause(c: AgentCondition): boolean {
  return c.field.trim().toLowerCase() === CONTENT_FIELD
}
export function contentClauses(plan: AgentPlan): AgentCondition[] {
  return plan.conditions.filter(isContentClause)
}
export function forwardDestination(action: CompiledAgentAction): string | null {
  const to = action.params?.to?.trim()
  return to && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) ? to : null
}
```
In `compileCondition`, at the top: `if (isContentClause(cond)) return () => true` (deferred to the AI stage; never force-false). Everything else unchanged.

- [ ] **Step 4: Run — expect PASS.** `pnpm --filter @revido/core test -- agent-plan`
- [ ] **Step 5: Commit** — `feat(core): content-clause split + forward destination helpers`

## Task 3: Core — content classifier

**Files:** Create `packages/core/src/prompt-builders/content-classifier.ts` (+ test); export from `packages/core/src/index.ts`.

- [ ] **Step 1: Failing test** — `buildContentClassifierPrompt('body text', 'an invoice or receipt')` returns `{ system, messages }` with the predicate + text embedded; system instructs strict JSON `{ "match": boolean }`.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement**

```ts
export interface ContentClassifierPrompt { system: string; messages: { role: 'user'; content: string }[] }
export function buildContentClassifierPrompt(text: string, predicate: string): ContentClassifierPrompt {
  return {
    system:
      'You decide whether an email (its body and any attachment text) matches a user rule. ' +
      'Return ONLY strict JSON {"match": true|false}. Be conservative: only true when clearly matching.',
    messages: [{ role: 'user', content: `Rule: the message is ${predicate}.\n\nEmail content:\n"""\n${text.slice(0, 12000)}\n"""\n\nDoes it match? Return {"match": boolean}.` }],
  }
}
export const CONTENT_CLASSIFIER_SCHEMA = { type: 'object', additionalProperties: false, required: ['match'], properties: { match: { type: 'boolean' } } } as const
```

- [ ] **Step 4: Run — PASS.** Export both from `index.ts`.
- [ ] **Step 5: Commit** — `feat(core): content-classifier prompt`

## Task 4: API — compile prompt understands forward + content

**Files:** Modify `apps/api/src/routes/agents-ai.ts`; Test `agents-ai.test.ts`.

- [ ] **Step 1: Failing test** — mock the LLM to assert the compile system prompt mentions `content` field and `params.to`. (Simplest: unit-assert `COMPILE_SYSTEM.includes('content')` and `.includes('params')`.)
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Update `COMPILE_SYSTEM`** — append to the conditions bullet: `Also valid is the "content" field: its value is a short natural-language description of what the message or its attachment IS (e.g. "an invoice or receipt", "a signed contract"); use it only when the rule depends on document content, not metadata.` And to the actions bullet: `For a "forward" action you MUST include "params": {"to": "<recipient email>"} with the destination address from the rule; if the rule gives no address, still emit the forward action with an empty "to" so the UI can ask for it.`
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** — `feat(api): compile prompt supports forward destination + content field`

## Task 5: API + worker — persist and reconstruct params/trusted

**Files:** Modify `apps/api/src/routes/agents.ts` (create route + `createAgentSchema`), `apps/worker/src/mail/pg-store.ts` (`reconstructPlan`, `getAgentPlan`), `apps/worker/src/mail/store.ts` (`StoredAgentPlan.trusted`).

- [ ] **Step 1: Failing tests** — (a) API create persists `agent_actions.params` and `agents.trusted`; (b) `reconstructPlan` includes `params` on actions; (c) `StoredAgentPlan` carries `trusted`.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement**
  - `createAgentSchema`: add `trusted: z.boolean().optional()`.
  - Create route: `.values({ ..., trusted: body.trusted ?? false })`; action insert add `params: action.params ?? null`.
  - `reconstructPlan(trigger, conditions, actionRows)`: actionRows now `{type,label,params}`; map `params: row.params ?? undefined` onto each action.
  - `getAgentPlan`: `select name, icon, trigger, conditions, trusted ...`; action query `select type, label, params ...`; return `{ name, icon, trusted: head.trusted, plan }`. Add `trusted: boolean` to `StoredAgentPlan`.
- [ ] **Step 4: Run — PASS** (core + api + worker suites for touched files).
- [ ] **Step 5: Commit** — `feat: persist + reconstruct forward params and trusted flag`

## Task 6: Worker — forward executor (store method)

**Files:** Modify `apps/worker/src/mail/store.ts` (`ForwardStore` interface), `apps/worker/src/mail/pg-store.ts` (impl); Test in `pg-store` or a focused unit.

- [ ] **Step 1: Failing test** — `forwardMessage({ userId, sourceMessageId, to, crypto })` creates an outbound row copying the source subject (prefixed `Fwd: `), body, and attachments, addressed to `to`, and enqueues a `send` job; idempotent on `(sourceMessageId, to)`.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** `forwardMessage`: load source message (decrypt body + `content_ct` attachments via crypto), insert a new outbound message row (encrypted) with `to=[{email:to}]`, `subject='Fwd: '+subject`, copied html/text + attachments, `in_reply_to` null (a forward, not a reply); insert a `send` job row (`queue='send'`, payload `{accountId, messageId}`, `run_at = now()+10s`). Guard: `on conflict do nothing` keyed by a deterministic dedupe (e.g. a unique `(source_message_id, forward_to)` marker column or a lookup before insert).
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** — `feat(worker): forward executor with 10s undo + idempotency`

## Task 7: Worker — two-stage eval + trusted-forward routing

**Files:** Modify `apps/worker/src/consumers/agent-run.ts`; Test `agent-run.test.ts`.

- [ ] **Step 1: Failing tests**
  - Structured predicate selects candidates; a `content` clause runs the classifier only on candidates; a candidate the classifier rejects is NOT acted on (fail-closed on classifier error too).
  - `forward` on a `trusted` agent calls `forwardMessage` (not `enqueueApproval`); on a non-trusted agent it calls `enqueueApproval` (carrying `params.to` + source messageId).
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement**
  - Extend `AgentRunDeps.mail` with `forwardMessage`; extend `StoredAgentPlan` usage to read `trusted`.
  - After `const matched = threads.filter(predicate)`, compute content clauses: `const clauses = contentClauses(plan)`. If clauses.length, for each matched thread load its text (`getThread`/`getMessageText`) and run `classifyContent` (model `'triage'`/cheap, fail-closed: any error ⇒ drop). Keep only threads passing ALL clauses.
  - In the action loop, special-case `action.type === 'forward'`:
    - `const to = forwardDestination(action)`; if `!to` → record a skipped/needs-destination note, continue.
    - if `stored.trusted` → `await deps.mail.forwardMessage({ userId, sourceMessageId: <latest inbound msg id of thread>, to, crypto })`, `applied++`.
    - else → `enqueueApproval({ ..., action: 'forward', messageId, params: { to } })`.
  - Add a `classifyContent` helper (uses `deps.llm.complete` + `buildContentClassifierPrompt` + `CONTENT_CLASSIFIER_SCHEMA`; returns false on parse/LLM error).
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** — `feat(worker): hybrid content eval + trusted auto-forward routing`

## Task 8: API — execute forward on approval

**Files:** Modify `apps/api/src/routes/approvals.ts`; `EnqueueApprovalInput`/approvals persistence to carry `params` + `messageId`; Test `approvals.test.ts`.

- [ ] **Step 1: Failing test** — approving a `forward` approval calls the forward executor (enqueues a send to `params.to`) in addition to `recordRun`; approving a non-forward action is unchanged.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** — `enqueueApproval` writes `params` + `message_id`; approve route: if `row.action === 'forward'` and `row.params?.to` and `row.messageId`, call the same forward-executor path (shared helper) before `recordRun`. Reuse the worker executor logic via a shared api-side `forwardMessage` (outbound insert + send enqueue) or a small service module imported by both.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** — `feat(api): approving a forward actually forwards`

## Task 9: Web — destination read-back, dry-run, auto toggle

**Files:** Modify `apps/web/src/components/agents/create-agent-dialog.tsx` (+ `compile.ts`, `hooks/agents.ts`); Test if component tests exist.

- [ ] **Step 1:** After compile, if the plan has a `forward` action, render the parsed `params.to` (editable) and a **"Forward automatically"** switch (default off → sends `trusted:false`; on → `trusted:true`). Keep the existing dry-run preview call; label it "would have forwarded N emails in the last 30 days" when a forward action is present.
- [ ] **Step 2:** Thread `trusted` + edited `params.to` into the create payload (`POST /agents`).
- [ ] **Step 3:** Manual + existing component tests green: `pnpm --filter @revido/web test`.
- [ ] **Step 4: Commit** — `feat(web): forwarding-rule read-back, dry-run, auto toggle`

## Task 10: Full verification + deploy

- [ ] Typecheck all: `./node_modules/.bin/tsc --noEmit` (or per-package). Expect clean.
- [ ] All suites: core, api, worker, web green.
- [ ] Apply migration `0006` to **staging** DB (drizzle runner) and **prod** via the normal deploy path.
- [ ] Push to `main` + `staging`; wait for Railway web/api/worker SUCCESS both envs.
- [ ] Staging E2E: create a rule "forward receipts with an attachment to <you>@…", send a test receipt-with-PDF, confirm it auto-forwards (or approval card appears when auto is off), verify activity log + 10s-undo behavior, and confirm a non-matching email is NOT forwarded (fail-closed).
- [ ] Repeat the E2E smoke on prod.

---

## Self-review notes
- Spec coverage: gaps A(Task1,4,5)/B(Task2,3,7)/C(Task6,8)/D(Task1,5,7) all mapped; UX Task9; verify Task10.
- Fail-closed classification enforced in Task 7 (classifier error ⇒ drop).
- Idempotency for forward in Task 6 (dedupe on source+to) prevents double-send on retry.
- Type consistency: `forwardDestination`, `contentClauses`, `CONTENT_FIELD`, `classifyContent`, `forwardMessage`, `StoredAgentPlan.trusted` used consistently across tasks.
