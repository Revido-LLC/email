# Contributing to Revido Mail

Thanks for helping build Revido Mail. This repo is the open-source UI shell — a real React SPA
rendered over a mock-data module. No backend, no OAuth, no AI calls yet; those land in a later
planning pass. Every commit is customer-facing, so treat it like production work.

## Prerequisites

- **Node ≥20** — we develop on Node 22.
- **pnpm 10** — pinned via `packageManager` in the root `package.json`. Run `corepack enable` and the
  right version is used automatically.

## Setup

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

On a **fresh clone, run `pnpm build` once before `pnpm typecheck`** — Turbo's `typecheck` task
depends on `^build`, so the workspace packages have to be built first.

## Commands

| Command                             | What it does                                    |
| ----------------------------------- | ----------------------------------------------- |
| `pnpm dev`                          | Run the web app (Vite) on http://localhost:5173 |
| `pnpm build`                        | Build all packages                              |
| `pnpm typecheck`                    | TypeScript project-wide (`tsc --noEmit`)        |
| `pnpm lint`                         | ESLint, including the `tokens-only` rule        |
| `pnpm format`                       | Prettier, write mode                            |
| `pnpm --filter @revido/web preview` | Serve a production build locally                |

## Workspaces

Three packages, wired together as a pnpm + Turbo monorepo:

- **`apps/web`** — Vite + React + TypeScript SPA, routed with TanStack Router (file-based).
- **`packages/ui`** — design tokens (Tailwind v4 CSS variables) + the component library. See
  [`packages/ui/DESIGN.md`](./packages/ui/DESIGN.md).
- **`packages/mock-data`** — a typed fake mailbox shaped like the future API. It is the data contract
  every screen renders against.

## Conventions

- **Tokens-only styling.** Style with token utilities (`bg-primary`, `text-muted-foreground`,
  `bg-cat-newsletters`). No arbitrary Tailwind values (`bg-[#abc]`, `w-[327px]`) — the
  `tokens-only/no-arbitrary-values` ESLint rule flags them. If no token covers what you need, add one
  in `packages/ui/src/styles/theme.css`.
- **Mark every AI element.** AI-generated copy carries a subtle sparkle — `<Sparkle/>` inline or
  `<AiTag/>` as a pill. Trust through transparency.
- **Mock data is the future API contract, types-first.** Edit `packages/mock-data/src/types.ts`
  before `data.ts`, and add new fields on existing interfaces as **optional** so the contract stays
  backward-compatible. Screens read through getters, never by filtering raw arrays inline.
- **Never commit `routeTree.gen.ts`.** TanStack Router generates it and it is gitignored — leave it
  that way.
- **Commits are customer-facing.** Write clean, human-standard messages. No AI-attribution trailers,
  no co-author lines, no 🤖 footers — anywhere, ever.
- **No test tooling, no backend code.** Both are deliberately deferred; the quality gates are
  `typecheck` + `lint` + `build`. Don't add either without a separate planning pass.

## `.claude/`

The `.claude/` directory holds project config for Claude Code users; it is inert for everyone else.

## License

By contributing you agree your work is licensed under [AGPL-3.0](./LICENSE).
