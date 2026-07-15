---
name: building-screens
description: Use when you add a screen / new route / new page, or change the X view in the web app — wiring routes, nav, palette, and keyboard shortcuts the Revido way.
---

# Building screens

The web app is a real SPA over mock data. Screens are cheap to add but must be
wired into the shell consistently. Reference the sources below — do not restate them.

## 1. Read first

- `packages/ui/DESIGN.md` — tokens, type scale, the AI-marker rule, component inventory.
- `docs/information-architecture.md` §6 (screen map) — the canonical list of screens,
  routes, and their adjacencies. If a new view is not in §6, it is a real IA decision:
  update §6 in the same change.

## 2. Routes (TanStack Router, file-based)

- Route files are flat in `apps/web/src/routes/`. Shell screens are `app.<name>.tsx`
  and render inside the `app.tsx` layout (nav rail · center stage · AI panel).
- Dynamic segments use `$param` files: e.g. `app.thread.$threadId.tsx`,
  `app.category.$categoryId.tsx`.
- `routeTree.gen.ts` is generated and gitignored (`**/routeTree.gen.ts`) — never edit
  or commit it; Vite regenerates it from the route files.

## 3. Shell integration checklist

A new destination is not "done" until all of these point at it:

- **Nav entry** — add a `NavLink` (or category row) in
  `apps/web/src/components/shell/nav-rail.tsx`.
- **Command palette** — add a `Command.Item` under the "Jump to" group in
  `apps/web/src/components/shell/command-palette.tsx`. The `value` string is the search
  corpus: put the label plus synonyms (e.g. `value="inbox needs you"`); the filter is a
  substring match on `value`.
- **Keyboard** — if it deserves a `g`-shortcut, add a key to the `dest` record in
  `apps/web/src/lib/use-global-keyboard.ts` (keyed by the second key, e.g. `i` → `/app/inbox`).
- **README route table** — add a row to the "Key routes" table in `README.md`.

## 4. Data

- Read only through `@revido/mock-data` getters (`getNeedsYou()`,
  `getThreadsByCategory()`, `getThread()`, …). Never import `THREADS` and filter inline.
- Need data the getters don't expose? Add a getter in the package — see the `mock-data`
  skill — don't reach around it.

## 5. Styling

- Token utilities only; the `tokens-only/no-arbitrary-values` ESLint rule fails the
  build on arbitrary values. No token for what you need? Add one to `theme.css`.
- Every AI-generated element carries `<Sparkle/>` inline or an `<AiTag/>` pill.
- `font-display` for greetings/titles/hero/empty-state headings; `<EmptyState>` for
  every zero state.

## 6. Verify

Run the `verify` skill (gates + route sweep in both themes). Don't hand-wave it.
