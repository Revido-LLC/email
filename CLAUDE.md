# Revido Mail — repo conventions

A free, web-based AI email client. This repo is (or will be) **public and open source** (AGPL-3.0).
Treat every commit as customer-facing.

## Non-negotiable: no AI-generation attribution

- **Never** add "Generated with Claude Code", "Co-Authored-By: Claude", or any AI attribution to
  commits, PR descriptions, code comments, or docs. The git history must read as clean, human-standard work.
- No AI co-author trailers. No "🤖" footers.

## Secrets hygiene

- Never commit secrets, tokens, or `.env` files.
- There IS a committed `.env.example` documenting variable **names only** (never values). Runtime
  secrets are injected by Infisical — see `docs/deploy.md`.
- This is enforced socially and by `.gitignore`; keep it that way from commit #1.

## What this repo is

A full-stack, **privacy-first** AI email client: React SPA (`apps/web`) + Hono API (`apps/api`) +
background worker (`apps/worker`) over Railway Postgres (`packages/db`), with provider-neutral domain
logic in `packages/core` (LLM via OpenRouter, embeddings, Gmail/Outlook sync, agents) and the shared
design system + data contract in `packages/ui` / `packages/mock-data`. It's deployable on Railway —
see `docs/deploy.md`. In dev the web app can run standalone over `@revido/mock-data`.

## Docs map

- `docs/information-architecture.md` — the IA: screens, routes, flows, taxonomy (§6 = screen map).
- `docs/api-contract.md` — the API contract.
- `docs/deploy.md` — the deploy runbook.
- `docs/provider-setup.md` — external-provider (OAuth/AI/storage) setup steps.
- `packages/ui/DESIGN.md` — the design system: tokens, type, components, the AI marker.
- `CONTRIBUTING.md` — setup, commands, and conventions for contributors.
- `.claude/skills/` — task playbooks for Claude Code: building-screens · mock-data · verify.

## Monorepo layout

- `apps/web` (`@revido/web`) — Vite + React + TypeScript SPA, TanStack Router (file-based). The UI; in dev renders over `@revido/mock-data`.
- `apps/api` (`@revido/api`) — Hono API on Node: CRUD, Better Auth (sessions + Google & Microsoft OAuth), AI SSE endpoints, provider webhooks, image proxy.
- `apps/worker` (`@revido/worker`) — background consumers off a Postgres-backed job queue: mailbox sync (Gmail + Outlook), triage, enrichment + embeddings, inbox agents, digests, reminders/chasers, outbound send.
- `packages/core` (`@revido/core`) — provider-neutral domain logic: LLM seam (`LlmClient`, over OpenRouter), embeddings, prompt builders, Gmail/Outlook adapters, agent planning, storage seam, language detection. No provider SDKs (REST over injected `fetch`).
- `packages/db` (`@revido/db`) — Drizzle schema + raw-SQL migrations (`0000`–`0005`), GUC Row-Level-Security, pgvector, per-user envelope-encryption crypto, domain types + Zod.
- `packages/mock-data` (`@revido/mock-data`) — the typed fake mailbox the UI renders against in dev; mirrors `@revido/db` domain types field-for-field (the shared data contract).
- `packages/ui` (`@revido/ui`) — design tokens (Tailwind v4 CSS variables) + component library. See `packages/ui/DESIGN.md`.

## Styling rules (mechanically enforced)

- **Tokens only.** Style with token utilities (`bg-primary`, `text-muted-foreground`, category
  utilities like `bg-cat-newsletters`). Do **not** use arbitrary Tailwind values (`bg-[#abc]`, `w-[327px]`).
  The `tokens-only/no-arbitrary-values` ESLint rule flags violations.
- AI output carries a subtle sparkle glyph (`<Sparkle/>`) in the blue accent — but **reserve it** for AI
  the user can act on or might be surprised by (drafts, summaries, agent actions), not every AI-touched
  pixel. A marker that's everywhere stops meaning anything.

## Commands

- `pnpm dev` — `turbo run dev`: the whole stack (web + api + worker; api/worker need env). UI-only: `pnpm --filter @revido/web dev` → :5173 (mock data).
- `pnpm build` — build all packages.
- `pnpm typecheck` — TS project-wide.
- `pnpm lint` — ESLint (incl. tokens-only rule).
- `pnpm test` — Vitest across api/worker/core/db (406 tests).
- `pnpm format` — Prettier.

## Package names

`@revido/web`, `@revido/api`, `@revido/worker`, `@revido/core`, `@revido/db`, `@revido/mock-data`, `@revido/ui`.
