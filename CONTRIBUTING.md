# Contributing to Revido Mail

Thanks for helping build Revido Mail — a free, web-based, privacy-first AI email client by Revido.
It's a full-stack monorepo: a React SPA, a Hono API, a background worker, and Postgres. Every commit
is customer-facing, so treat it like production work.

## Prerequisites

- **Node ≥20** — we develop on Node 22.
- **pnpm 10** — pinned via `packageManager` in the root `package.json`. Run `corepack enable` and the
  right version is used automatically.

## Setup

```bash
pnpm install
```

Then pick a dev mode:

- **UI-only** — `pnpm --filter @revido/web dev` runs just the web app on http://localhost:5173
  against `@revido/mock-data`. No backend, no secrets. This is all you need for most UI work.
- **Whole stack** — `pnpm dev` (`turbo run dev`) starts web + api + worker together. The api and
  worker need env: a local `.env` or `infisical run` (see [`docs/deploy.md`](./docs/deploy.md)).

On a **fresh clone, run `pnpm build` once before `pnpm typecheck`** — Turbo's `typecheck` task
depends on `^build`, so the workspace packages have to be built first.

## Commands

| Command                             | What it does                                       |
| ----------------------------------- | -------------------------------------------------- |
| `pnpm dev`                          | Run the whole stack (web + api + worker) via Turbo |
| `pnpm build`                        | Build all packages                                 |
| `pnpm typecheck`                    | TypeScript project-wide (`tsc --noEmit`)           |
| `pnpm lint`                         | ESLint, including the `tokens-only` rule           |
| `pnpm test`                         | Vitest across api/worker/core/db — 406 tests       |
| `pnpm format`                       | Prettier, write mode                               |
| `pnpm --filter @revido/web preview` | Serve a production build locally                   |

## Workspaces

Seven workspaces, wired together as a pnpm + Turbo monorepo:

- **`apps/web`** (`@revido/web`) — Vite + React + TypeScript SPA, TanStack Router (file-based). The UI;
  in dev it renders over `@revido/mock-data`.
- **`apps/api`** (`@revido/api`) — Hono API on Node: CRUD, Better Auth (sessions + Google & Microsoft
  OAuth), AI SSE endpoints, provider webhooks, image proxy.
- **`apps/worker`** (`@revido/worker`) — background consumers off a Postgres-backed job queue: mailbox
  sync (Gmail + Outlook), triage, enrichment + embeddings, inbox agents, digests, reminders/chasers,
  outbound send.
- **`packages/core`** (`@revido/core`) — provider-neutral domain logic: LLM seam (`LlmClient`, over
  OpenRouter), embeddings, prompt builders, Gmail/Outlook adapters, agent planning, storage seam,
  language detection. No provider SDKs (REST over injected `fetch`).
- **`packages/db`** (`@revido/db`) — Drizzle schema + raw-SQL migrations (`0000`–`0005`), GUC
  Row-Level-Security, pgvector, per-user envelope-encryption crypto, domain types + Zod.
- **`packages/mock-data`** (`@revido/mock-data`) — the typed fake mailbox the UI renders against in
  dev; mirrors `@revido/db` domain types field-for-field (the shared data contract).
- **`packages/ui`** (`@revido/ui`) — design tokens (Tailwind v4 CSS variables) + component library. See
  [`packages/ui/DESIGN.md`](./packages/ui/DESIGN.md).

## Conventions

- **Tokens-only styling.** Style with token utilities (`bg-primary`, `text-muted-foreground`,
  `bg-cat-newsletters`). No arbitrary Tailwind values (`bg-[#abc]`, `w-[327px]`) — the
  `tokens-only/no-arbitrary-values` ESLint rule flags them. If no token covers what you need, add one
  in `packages/ui/src/styles/theme.css`.
- **Mark every AI element.** AI-generated copy carries a subtle sparkle — `<Sparkle/>` inline or
  `<AiTag/>` as a pill. Trust through transparency.
- **Mock data is the data contract, types-first.** `@revido/mock-data` is what the UI renders against
  in dev and it mirrors `@revido/db`'s domain types. Edit `packages/mock-data/src/types.ts` before
  `data.ts`, and add new fields on existing interfaces as **optional** so the contract stays
  backward-compatible. Screens read through getters, never by filtering raw arrays inline.
- **Never commit `routeTree.gen.ts`.** TanStack Router generates it and it is gitignored — leave it
  that way.
- **Commits are customer-facing.** Write clean, human-standard messages. No AI-attribution trailers,
  no co-author lines, no 🤖 footers — anywhere, ever.
- **Mind the quality gates.** All four must pass: `build` + `typecheck` + `lint` + `test`. Tests are
  Vitest — 406 of them across `api`/`worker`/`core`/`db`, co-located as `*.test.ts` next to the source
  they cover. The web app has no component tests; verify web changes by driving the app.

## `.claude/`

The `.claude/` directory holds project config for Claude Code users; it is inert for everyone else.

## License

By contributing you agree your work is licensed under [AGPL-3.0](./LICENSE).
