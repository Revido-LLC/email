# Natural-language forwarding rules — design

**Date:** 2026-07-21
**Status:** Approved (brainstorm), pending spec review

## Summary

Let a Revido Mail user create **forwarding rules in plain English** — e.g. *"Forward any
invoice or receipt to accounting@revido.co"* or *"When a signed contract PDF arrives, forward
it to legal@revido.co"* — and have the system understand the content, decide when a message
qualifies, and forward it (with its original attachments) automatically.

Invoices/receipts are only the first example. The capability is **general**: any rule a user
can describe, including ones that hinge on what a document *is*, not just thread metadata.

This is a **completion of the existing inbox-agents framework**, not a new subsystem. The
natural-language compiler (`POST /agents/compile`, Opus), the predicate runtime, the
approval queue, the run/activity history, and the create-agent dialog already exist. We close
four gaps that block the forwarding use case.

## Non-goals

- No new parallel "rules" system — reuse `agents` / `agent_actions` / `agent_runs` / `approvals`.
- No hardcoded invoice/receipt rule. Invoice detection is expressed *by the user's rule text*,
  evaluated by a general content-classification condition.
- No change to Gmail/Outlook send transport — reuse the existing `send` consumer + adapter
  `send()` (already carries attachments on both providers).
- Not building bulk historical forwarding — rules act on **newly arrived** mail
  (`trigger: new-mail`). Scheduled rules are out of scope for this spec.

## Current state (what already works)

- **NL rule creation:** `apps/web/src/components/agents/create-agent-dialog.tsx` +
  `POST /agents/compile` turns a description into an `AgentPlan`
  (`packages/core/src/agent-plan.ts`): `{trigger, conditions[], actions[]}`.
- **`forward` is a defined action type** and is correctly marked *consequential*
  (`CONSEQUENTIAL_ACTIONS`), so the runtime routes it to approval rather than acting unattended.
- **Triage** classifies every email into 9 categories including `receipts` (invoices/payment
  confirmations land here per the taxonomy), plus a `hasAttachments` flag — both available to
  the predicate compiler for free.
- **Runtime:** the `agent-run` worker consumer compiles the plan's conditions to a
  `(thread) => boolean` predicate, applies safe actions inline, and queues consequential ones
  as `approvals` rows.
- **Undo window:** the `send` consumer already enqueues outbound with `runAt = now + 10s` —
  a built-in cancellable window we reuse as the auto-forward safety net.

## The four gaps to close

### A. Capture and persist the forward destination

- **Problem:** `AGENT_PLAN_JSON_SCHEMA` allows `action.params`, but `COMPILE_SYSTEM` never
  instructs the model to emit a destination, and `agent_actions` has no column to store it.
- **Change:**
  - Migration: add `params jsonb` to `agent_actions` (nullable; plaintext config, no mail content).
  - Extend `COMPILE_SYSTEM`: for a `forward` action, extract the recipient into
    `params.to` (a single email address). If the rule says "forward" without a destination,
    the compile result is flagged incomplete so the UI can prompt for the address.
  - Validate `params.to` is a syntactically valid email at compile time and again before send.

### B. Content / attachment conditions (hybrid classification)

- **Problem:** conditions resolve only thread-level fields; "the attachment is an invoice"
  is not expressible with precision.
- **Change:** introduce a content-classification condition. In the plan, this is an ordinary
  condition clause with the single reserved field **`content`** (covers the message body and any
  attachment text), whose `value` is a short natural-language predicate ("an invoice or receipt").
  Evaluation is split into two stages in the worker (this is the hybrid, cost-controlled path):
  1. **Cheap structured predicates first** — the existing synchronous `compilePredicate`
     (over `category`, `hasAttachments`, `from`, …) selects candidate threads for free.
  2. **AI clause on candidates only** — for a rule that includes a content/attachment clause,
     run one focused classification (cheap ZDR model) per candidate that passed stage 1,
     returning a boolean. Only candidates that also pass stage 2 proceed to the action.
  - `compilePredicate` returns the structured predicate **plus** the list of unresolved AI
    clauses, so the runtime knows what still needs an AI check. A plan with no AI clauses runs
    exactly as today (zero extra cost).
  - The classification reads the message + attachment text already extracted during
    enrichment where available, to avoid re-parsing.

### C. Execute an approved / trusted forward

- **Problem:** approving a consequential action calls `recordRun` only — nothing sends. The
  forward is a dead-end.
- **Change:** add a forward executor that builds a "Fwd: <subject>" `OutboundMessage`
  carrying the original body and **original attachments**, addressed to `params.to`, and
  enqueues it through the existing `send` consumer. Wire it into:
  - the **approval-approve** path (`POST /approvals/:id/approve`) — approving a forward now
    actually forwards; and
  - the **auto-run** path (gap D).
  - Executor is idempotent per `(agentId, sourceMessageId, to)` so a retried job never
    double-sends.

### D. Auto-run with a safety net

- **Change:**
  - Migration: add `trusted boolean not null default false` to `agents`.
  - In `agent-run`, a `forward` action on a **trusted** rule bypasses the approval queue and
    calls the executor directly; the send's existing 10-s deferred window is the undo.
    A **non-trusted** rule keeps today's approval card.
  - Every forward (auto or approved) writes an `agent_runs` row → the existing activity log.
  - Default is **untrusted**: a newly created rule is safe until the user flips "forward
    automatically" on.

## UX (stays natural-language)

Enhance the existing create-agent dialog — no forms or field-pickers:

1. User types the rule (e.g. *"forward invoices and receipts to accounting@revido.co"*).
2. It compiles; the dialog shows a human read-back: the detected **destination**, the
   **conditions** in plain words, and a **dry-run preview** ("this would have forwarded 7
   emails in the last 30 days") via `POST /agents/dry-run`.
3. A **"Forward automatically"** toggle (default **off** → approval-gated; on → trusted).
4. If the destination is missing/ambiguous, the dialog asks for it inline before saving.

## Data flow

```
new mail → triage (category, hasAttachments) → agent-run consumer
  └ stage 1: compilePredicate (structured) selects candidates  [free]
      └ stage 2: AI content-clause check on candidates only     [paid, few]
          └ match:
              ├ trusted rule  → forward executor → send consumer (10s undo) → agent_runs
              └ untrusted     → approvals row → user approves → forward executor → send → agent_runs
```

## Error handling

- Missing/invalid `params.to` → rule cannot be saved as a forward; compile flags it; executor
  refuses to send (no silent drop — surfaced on the run/approval).
- AI classification failure on a candidate → treated as **no match** (fail-closed: never
  auto-forward on an uncertain/failed classification); logged.
- Send failure → the existing send-consumer retry/DLQ applies; the `agent_runs` row reflects
  the failure rather than a false success.
- Idempotency key on the executor prevents double-forward on retry.

## Testing

- **Compiler:** destination extraction into `params.to`; email validation; content-clause
  parsing; a "forward with no destination" flagged incomplete.
- **Two-stage evaluator:** structured predicate gates the AI check; a no-AI-clause plan makes
  zero AI calls; fail-closed on classification error.
- **Forward executor:** "Fwd:" subject, original attachments preserved, addressed to
  `params.to`, idempotent on retry.
- **Auto vs approval routing:** trusted → executor + 10s undo; untrusted → approval;
  approving an untrusted forward executes it.
- **Dry-run integration:** preview counts match the predicate over the last 30 days.

## Migrations

1. `agent_actions.params jsonb` (nullable).
2. `agents.trusted boolean not null default false`.

Both are additive, idempotent, and reversible; follow the repo's drizzle SQL + breakpoint
convention and register in the RLS registry as needed (both tables are already user-scoped).

## Rollout

- Ships behind the existing agents surface; no new public endpoints beyond reusing
  compile/dry-run/approve.
- Auto-forward defaults off, so the blast radius on release is zero until a user opts a rule in.
- Verify end-to-end against a real mailbox in staging (now self-contained) before prod.
