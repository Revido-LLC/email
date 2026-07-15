# Revido Mail — repo conventions

A free, web-based AI email client. This repo is (or will be) **public and open source** (AGPL-3.0).
Treat every commit as customer-facing.

## Non-negotiable: no AI-generation attribution

- **Never** add "Generated with Claude Code", "Co-Authored-By: Claude", or any AI attribution to
  commits, PR descriptions, code comments, or docs. The git history must read as clean, human-standard work.
- No AI co-author trailers. No "🤖" footers.

## Secrets hygiene

- Never commit secrets, tokens, or `.env` files.
- The UI phase has no env vars, so there's no `.env.example` yet — don't create an empty one.
  When server work introduces variables, a committed `.env.example` will document their names.
- This is enforced socially and by `.gitignore`; keep it that way from commit #1.

## What this repo is (current phase)

**UI only.** A real React SPA rendered over a mock-data module — no backend, no database, no OAuth,
no AI calls, no deployment. The work is the production UI shell, not throwaway mockups. Everything
server-side is a later, separate planning pass.

## Docs map

- `docs/information-architecture.md` — the IA: screens, routes, flows, taxonomy (§6 = screen map).
- `packages/ui/DESIGN.md` — the design system: tokens, type, components, the AI marker.
- `CONTRIBUTING.md` — setup, commands, and conventions for contributors.
- `.claude/skills/` — task playbooks for Claude Code: building-screens · mock-data · verify.

## Monorepo layout

- `apps/web` — Vite + React + TypeScript SPA, TanStack Router (file-based routing).
- `packages/ui` — design tokens (Tailwind v4 CSS variables) + component library. See `packages/ui/DESIGN.md`.
- `packages/mock-data` — typed fake mailbox shaped like the future API. The data contract for all screens.

## Styling rules (mechanically enforced)

- **Tokens only.** Style with token utilities (`bg-primary`, `text-muted-foreground`, category
  utilities like `bg-cat-newsletters`). Do **not** use arbitrary Tailwind values (`bg-[#abc]`, `w-[327px]`).
  The `tokens-only/no-arbitrary-values` ESLint rule flags violations.
- Every AI-generated UI element carries a subtle sparkle glyph (`<Sparkle/>`) — trust through transparency.

## Commands

- `pnpm dev` — run the web app (Vite).
- `pnpm build` — build all packages.
- `pnpm typecheck` — TS project-wide.
- `pnpm lint` — ESLint (incl. tokens-only rule).
- `pnpm format` — Prettier.

## Package names

`@revido/web`, `@revido/ui`, `@revido/mock-data`.
