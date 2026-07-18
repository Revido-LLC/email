# Revido Mail

**Your inbox, handled.** A free, web-based AI email client — built by [Revido](https://revido.co).

> A privacy-first AI email client, shipped as a full-stack monorepo: a React SPA, a Hono API, a
> background worker, and Postgres. It's open source so you can read the code and verify the privacy
> claims for yourself.

## Stack

A pnpm + Turbo monorepo of 7 workspaces:

- **`apps/web`** (`@revido/web`) — Vite + React + TypeScript SPA, TanStack Router (file-based routing). The UI; in dev it renders over `@revido/mock-data`.
- **`apps/api`** (`@revido/api`) — Hono API on Node: CRUD over threads/messages/accounts/agents/etc., Better Auth (sessions + Google & Microsoft OAuth), AI SSE endpoints, provider webhooks, image proxy.
- **`apps/worker`** (`@revido/worker`) — background consumers off a Postgres-backed job queue: mailbox sync (Gmail + Outlook), triage, enrichment + embeddings, inbox agents, digests, reminders/chasers, outbound send.
- **`packages/core`** (`@revido/core`) — provider-neutral domain logic: the LLM seam (`LlmClient`, over OpenRouter), embeddings seam, prompt builders, Gmail/Outlook adapters, agent planning, storage seam, language detection. No provider SDKs (REST over injected `fetch`).
- **`packages/db`** (`@revido/db`) — Drizzle schema + raw-SQL migrations (`0000`–`0005`), GUC Row-Level-Security, pgvector, per-user envelope-encryption crypto, domain types + Zod.
- **`packages/mock-data`** (`@revido/mock-data`) — the typed fake mailbox the UI renders against in dev; mirrors `@revido/db` domain types field-for-field (the shared data contract).
- **`packages/ui`** (`@revido/ui`) — design tokens (Tailwind v4 CSS variables) + the component library.

Stack at a glance: React / Vite / TanStack Router / Tailwind v4 (web) · Hono + Better Auth (api) · Railway Postgres 18 (pgvector + pgcrypto) via Drizzle (db) · OpenRouter (OpenAI chat-completions format) for the LLM · Voyage/OpenAI embeddings · Resend (email) · deployed on Railway (single project, private networking). Privacy: per-user envelope encryption + per-request no-training/ZDR on the LLM.

## Getting started

```bash
pnpm install
```

Two dev modes:

```bash
# UI-only: just the web app, over mock data — no backend, no secrets.
pnpm --filter @revido/web dev   # http://localhost:5173

# Whole stack: web + api + worker. The api/worker need env
# (a local .env or `infisical run` — see docs/deploy.md).
pnpm dev
```

Key routes:

| Route                       | Screen                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `/`                         | Landing page                                                                                                                      |
| `/onboarding`               | 30-second first-run wow                                                                                                           |
| `/app`                      | Today (AI morning brief)                                                                                                          |
| `/app/inbox`                | Thread list — Needs You                                                                                                           |
| `/app/approvals`            | Approvals — pending agent actions to review                                                                                       |
| `/app/category/:categoryId` | Category view (9 categories: to-reply, awaiting-reply, fyi, newsletters, notifications, promotions, receipts, calendar, personal) |
| `/app/thread/:id`           | Thread takeover                                                                                                                   |
| `/app/compose`              | Composer (prompt bar + tone chips)                                                                                                |
| `/app/agents`               | Inbox agents (gallery / create / feed)                                                                                            |
| `/app/reminders`            | Reminders                                                                                                                         |
| `/app/settings`             | Settings                                                                                                                          |
| `/talk`                     | Talk to Revido                                                                                                                    |
| `/design`                   | Kitchen-sink: tokens + component gallery                                                                                          |

## Scripts

- `pnpm dev` · `pnpm build` · `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm format`

`build`, `typecheck`, `lint`, and `test` run through `turbo run` across the workspaces. Tests are
vitest (api/worker/core/db); the web app has no component tests — verify web changes by driving the app.

## Docs

- [Information architecture](./docs/information-architecture.md) — screen map, navigation model, IA rationale.
- [Design system](./packages/ui/DESIGN.md) — tokens, categories, the AI marker, component inventory.
- [API contract](./docs/api-contract.md) — the HTTP surface between web and api.
- [Deploy runbook](./docs/deploy.md) — env vars, secrets, and the Railway deployment path.
- [Provider setup](./docs/provider-setup.md) — the external accounts to configure (Google, Microsoft, embeddings, storage).
- [Contributing](./CONTRIBUTING.md) — setup, commands, and conventions.

## License

[AGPL-3.0](./LICENSE) — don't trust us, read the code.
