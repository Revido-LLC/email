# Agent creation — accurate matching, honest dry-run, and an interactive clarify step

**Date:** 2026-07-22
**Status:** Design — approved, pending spec review

## Problem

Creating the agent *"Forward every new receipt to accounting@revido.io"* produced a dry-run that
claimed **193 emails "in Receipts"** and listed dunning notices, past-due warnings, payment-failure
alerts, and billing-shaped phishing (`[FINAL NOTICE] Update your payment information`, `URGENT: Your
Twilio account couldn't be recharged`, `Your Browserstack account has been suspended`). None are
receipts. Two root causes:

1. **The dry-run doesn't run the AI check — it dumps a raw category bucket.** Opus compiles the rule
   into a plan with both a `category is receipts` clause and a `content is "a receipt"` clause, but
   the preview (`create-agent-dialog.tsx`) throws the content clause away: `planToDisplay` keeps only
   the `category` clause and `DryRun` lists `useThreadsByCategory('receipts')` filtered by
   `t.category === 'receipts'`. "Receipts" is a coarse triage bucket that lumps in every
   billing-adjacent message. The `content` clause that *would* filter them is silently dropped.
   Content clauses are pass-through in `compilePredicate` (`() => true`) by design (the worker pays
   for the AI) — the bug is that the preview inherits that pass-through and never substitutes the
   real check. **Preview logic ≠ runtime logic.**

2. **No interaction during creation.** The wizard jumps from free text straight to a compiled plan,
   guessing at exactly the decisions that matter (attachments? which senders? auto vs. approval? what
   counts as a receipt?). The user never gets to steer.

Naively "fix" #1 by AI-classifying all 193 candidates on every dry-run and the token bill explodes —
so cost control is a first-class constraint, not an afterthought.

## Goals

- The dry-run shows **what the agent will actually do** (preview == runtime).
- Dunning/failure/phishing mail is **never** matched as a receipt.
- Creation is **interactive**: the AI asks 1–3 grounded questions, pre-answered with best guesses.
- Token cost is **bounded and lower than today** (pre-filter for free, cache verdicts, cap the
  preview sample).
- The fix is the **general content-matching pipeline** — receipts are one pluggable rule; contracts,
  shipping, etc. get the same treatment.

## Non-goals

- Changing the triage categorizer or the category taxonomy itself.
- Upgrading the content-classifier model tier (the pre-filter removes the hard false-positives, so
  the cheap `triage` model stays).
- Multi-turn free-form chat during creation (the clarify step is bounded, structured questions).

## Architecture

### One shared evaluation pipeline (preview and runtime both use it)

```
metadata predicate   →   deterministic pre-filter (FREE)   →   AI classify (capped + cached)
  (category / from /       receipt-vs-dunning discriminator       only on survivors, once ever
   attachments / …)        hard-drops junk, no LLM
```

### Wizard flow

```
Describe  →  Refine (AI questions, pre-answered)  →  Plan  →  Dry-run (honest)  →  Enable
```

## Components

### 1. `packages/core/src/content-prefilter.ts` (new, pure)

A pluggable, LLM-free discriminator that runs before any classifier call.

- **Doc-type detection** from a `content` clause value → one of a small registry
  (`receipt`, `invoice`, `contract`, `shipping`, or `generic`).
- **Registry** per doc-type: an `include` lexicon, a hard `exclude` lexicon, and required cheap
  signals. For `receipt`:
  - `exclude` (hard drop, never classify, never forward): `past due`, `overdue`, `final notice`,
    `suspended`, `suspend`, `couldn't be charged`, `could not be charged`, `payment failed`,
    `failed payment`, `declined`, `action required`, `update your payment`, `unpaid`,
    `reminder to pay`, `downgrade`, `recharge`.
  - `include` (positive signal): `receipt`, `payment received`, `payment confirmation`,
    `order confirmation`, `thanks for your purchase`, `your receipt from`, `paid`.
- **Signals** extracted cheaply from a thread (no decryption of full bodies beyond the already-loaded
  subject/snippet): `subject`, `snippet`, `senderEmail`, `hasAttachments`, `hasCurrencyAmount`.
- **API:** `detectDocType(clauseValue): DocType` and
  `prefilterVerdict(signals, docType): 'exclude' | 'pass'`. `generic` doc-types always `pass`
  (today's behaviour — no regression for non-receipt agents).
- Pure and fully unit-tested; the exclude lexicon is the single source of truth for "this is dunning,
  not a receipt."

### 2. `planContentEvaluation(plan, threads)` (core, pure)

The shared planner both callers use, so preview and runtime can never drift again.

- Applies the existing metadata `compilePredicate`.
- For threads with `content` clauses, runs `prefilterVerdict` per detected doc-type.
- Returns `{ excluded: {thread, reason}[]; needsAi: Thread[]; autoMatched: Thread[] }`
  (`autoMatched` = candidates with no content clause; `needsAi` = passed metadata + pre-filter, still
  need the classifier; `excluded` = hard-dropped by pre-filter, with a human reason).
- Core stays LLM- and DB-free; the AI + cache are injected by each caller.

### 3. Verdict cache — `agent_content_verdicts` (db)

The main anti-bankruptcy lever: a thread is AI-classified **once, ever**, per clause.

- Table: `agent_content_verdicts (user_id, thread_id, clause_hash, verdict boolean, model,
  created_at)`, RLS-scoped to the owner, unique on `(user_id, thread_id, clause_hash)`.
- `clause_hash` = stable hash of the normalized content-clause value(s) of the plan.
- Store methods: `getVerdicts(userId, threadIds, clauseHash)` and
  `putVerdict(userId, threadId, clauseHash, verdict, model)`.
- Verdicts describe immutable email content, so no TTL. The dry-run's verdicts are reused by the
  runtime and by every re-run of the dry-run.

### 4. `POST /agents/clarify` (api, new)

- Input: `{ description }`.
- **Small model** (`summary` tier, capped tokens — *not* the Opus escalation compile), structured
  output:
  `{ questions: [{ id, question, options: [{ id, label }], multi: boolean, defaultOptionIds: string[] }] }`.
- **Grounded** system prompt: hands the model the real matching-lever vocabulary (attachments,
  sender/domain, category, amount-present, auto-forward vs. one-tap approval, "what counts as X") so
  every question maps to a real condition or action the compiler can honour.
- Each question carries the model's **best-guess default** (`defaultOptionIds`) so the UI renders it
  pre-selected — the user clicks through or tweaks.
- Cap at **3 questions**. If the rule is unambiguous the model may still return sensible confirming
  questions (per the chosen "always ask, pre-answered" behaviour), but never more than 3.

### 5. `POST /agents/compile` (api, modified)

- Accepts optional `answers` (the clarify selections, resolved to human text) alongside `description`.
- Folds them into the user message so Opus compiles with the disambiguation already applied
  (e.g. `hasAttachments is true`, the right auto/approval mode, a sharp content definition).
- Canonical receipt guidance added to `COMPILE_SYSTEM`: emit a content value like *"a receipt for a
  completed payment — exclude invoices, bills, dunning, and payment-failure notices"* and always pair
  a `content` clause with the cheap metadata gate the user implied.

### 6. `POST /agents/dry-run` (api, rewritten)

- Metadata predicate over the last 30 days of threads → candidates.
- `planContentEvaluation` → `excluded` + `needsAi` + `autoMatched`.
- AI-classify **at most `PREVIEW_AI_CAP` (~10)** of `needsAi` (caching every verdict); reuse any
  cached verdicts first so re-runs cost nothing new.
- Estimate the remainder from the sampled hit-rate.
- Response shape:
  `{ matched: Thread[]; candidateCount; excludedCount; excludedReasons: {label,count}[];
     sampledCount; estimatedMatches }`.

### 7. `apps/worker/src/consumers/agent-run.ts` (modified)

- Replace the inline candidate + `classifyThreadContent` loop with `planContentEvaluation` + the
  cached classifier, so runtime uses the identical pipeline and reuses preview verdicts. Fail-closed
  behaviour preserved (any error ⇒ drop).

### 8. `apps/web` wizard (modified)

- New **Refine** step between Describe and Plan: calls `/agents/clarify`, renders the questions with
  the model's defaults pre-selected (chips/toggles), every question skippable; answers thread into
  the compile call.
- Dry-run step calls the **server** `/agents/dry-run` (the existing `useDryRunAgent` hook, currently
  unused) instead of client-side category filtering.
- Honest `DryRun` UI:
  > **11 receipts found** · checked 10, ~1 more likely · **182 excluded** (past-due notices, payment
  > failures — not receipts)

## Data flow

1. **Describe** → `/agents/clarify` (cheap model) → questions with defaults.
2. **Refine** → user tweaks/accepts → answers.
3. **Compile** → `/agents/compile` (Opus, description + answers) → `AgentPlan`.
4. **Dry-run** → `/agents/dry-run` → metadata predicate → pre-filter → capped cached classify →
   honest counts.
5. **Enable** → `/agents` persists the plan (unchanged).
6. **Runtime** → `agent-run` → same planner → cached classify (reuses step 4 verdicts) → gated
   actions (forward stays approval-gated unless `trusted`).

## Error handling

- `/agents/clarify` fails or returns nothing → skip Refine, go straight to compile with the raw
  description (graceful degradation, never blocks creation).
- `/agents/compile` fails → existing offline fallback compiler.
- Per-thread classify error in dry-run or runtime → **fail-closed** (thread excluded from `matched`),
  preview still renders the rest.
- Pre-filter is pure and total — cannot fail.

## Testing (TDD)

- `content-prefilter`: receipt include/exclude cases (the four screenshot subjects must all
  `exclude`), generic fallback `pass`, doc-type detection.
- `planContentEvaluation`: excluded/needsAi/autoMatched partitioning.
- verdict cache store: put/get, uniqueness, RLS scoping.
- `/agents/clarify`: structured shape, ≤3 questions, defaults present.
- `/agents/compile`: answers folded into the prompt; still validates.
- `/agents/dry-run`: excluded/sampled/estimate math; cached verdicts not re-classified.
- `agent-run`: dunning candidate excluded for free; preview verdict reused (no second LLM call).
- web: Refine renders with pre-selected defaults and is skippable; DryRun shows honest counts.

## Cost

- **Before:** dry-run = 0 AI but wrong; runtime ≈ **1 classifier call per Receipts email** (~193/mo).
- **After:** pre-filter drops ~60–70% for free; dry-run ≤ **10 calls** (cached); runtime classifies
  only survivors, **once each** (cached). Clarify adds **one cheap small-model call** per creation.
  Net ≈ **65% fewer classifier calls** *and* correct.

## Rollout / backward compatibility

- One new migration (`agent_content_verdicts`). Additive, RLS-scoped.
- Existing agents keep working unchanged: the pre-filter only narrows content-clause candidates and
  `generic` doc-types are unaffected; metadata-only agents bypass stages 2–3 entirely.
- Clarify and honest dry-run are new UI surfaces; no change to persisted agent shape.
