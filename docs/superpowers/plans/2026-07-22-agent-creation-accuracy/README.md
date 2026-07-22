# Agent Creation — Accurate Matching, Honest Dry-Run & Clarify Step — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read one phase file at a time.

**Goal:** Make inbox-agent creation accurate (real receipts, not dunning/phishing), honest (the dry-run shows what the agent will actually do), and interactive (the AI asks pre-answered clarifying questions) — while cutting token cost.

**Architecture:** Introduce one shared matching pipeline — `metadata predicate → free deterministic pre-filter → capped AI classify` — used by BOTH the server dry-run and the worker, so the preview can never diverge from runtime again. A new cheap `clarify` step gathers grounded, pre-answered questions before the Opus compile. Cost is bounded by the free pre-filter (drops dunning/phishing with zero tokens), an in-request classify cap of 10 for the preview, and (optional Phase 5) a persistent per-thread verdict cache.

**Tech Stack:** TypeScript, Hono (api), plain job-loop (worker), Vite + React + TanStack Router (web), Drizzle + Postgres (db), Vitest, Zod, OpenRouter LLM client.

**Spec:** [`../../specs/2026-07-22-agent-creation-accuracy-clarify-design.md`](../../specs/2026-07-22-agent-creation-accuracy-clarify-design.md)

**Repo/worktree:** run all commands from the repo root of the `revidostudio/ai-email-client-plan` worktree.

**Test commands:** `pnpm --filter @revido/core test` · `pnpm --filter @revido/api test` · `pnpm --filter @revido/worker test` · `pnpm --filter @revido/web test`. Single file: `pnpm --filter @revido/core exec vitest run src/<file>.test.ts`. Typecheck: `pnpm --filter @revido/<pkg> exec tsc --noEmit`.

## Phase gating

Finish and verify each phase before starting the next. Within a phase, tasks that touch disjoint files may run in parallel; tasks sharing a file serialize. Phases 1–4 are the complete, shippable fix. Phase 5 is an optional cost optimization (persistent cache) — the fix works without it via the free pre-filter + in-request cap.

| Phase | File | Tasks | Parallelism |
|-------|------|-------|-------------|
| 1 — Core matching foundation | [phase-1-core.md](phase-1-core.md) | 1, 2, 3 | 1‖2, then 3 |
| 2 — API: clarify, compile, dry-run | [phase-2-api.md](phase-2-api.md) | 4, 5, 6 | sequential (shared file) |
| 3 — Worker: one pipeline | [phase-3-worker.md](phase-3-worker.md) | 7 | — |
| 4 — Web: clarify + honest dry-run | [phase-4-web.md](phase-4-web.md) | 8, 9, 10 | sequential (shared file) |
| 5 — (Optional) verdict cache | [phase-5-cache.md](phase-5-cache.md) | 11, 12 | sequential |

## Root cause (why the bug happens)

The dry-run never runs the AI check — it lists the raw `receipts` category bucket and drops the `content` clause, so dunning/failure/phishing mail ("FINAL NOTICE", "Past Due", "couldn't be recharged", "suspended") shows as receipts. Preview logic ≠ runtime logic. This plan collapses them into one pipeline and adds a free discriminator + an interactive clarify step. See the spec for the full diagnosis.

## Self-Review

**Spec coverage:** shared pipeline (Tasks 2, 6, 7) ✓ · free receipt/dunning discriminator (Task 1) ✓ · verdict cache (Phase 5) ✓ · clarify endpoint pre-answered (Tasks 4, 9) ✓ · compile folds answers + sharper prompt (Task 5) ✓ · honest dry-run UI (Task 10) ✓ · cost bound (pre-filter + `PREVIEW_AI_CAP` + cache) ✓ · general (registry with `generic` fallback) ✓ · error handling: clarify-skip (Task 9), compile fallback (existing, preserved), fail-closed classify (Tasks 6, 7) ✓.

**Type consistency:** `planContentEvaluation` returns `{ autoMatched, needsAi, excluded }` used identically in Tasks 6 and 7. `DryRunResult` fields defined in Task 8, produced verbatim in Task 6. `ClarifyQuestion` shape identical across api schema (Task 4) and web types (Task 8). `PrefilterSignals` = `{ subject, snippet }` consistent between Tasks 1 and 2.

**Deviations from spec (intentional):** pre-filter signals reduced to `{ subject, snippet }` (the exclusion gate is text-only; attachment/amount signals deferred until a rule needs them — YAGNI). Persistent cache split into optional Phase 5 so Phases 1–4 ship the complete user-visible fix using in-request capping.
