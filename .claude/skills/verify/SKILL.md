---
name: verify
description: Verify a change in the Revido Mail web app — run the gates, sweep the routes in both themes, and spot-check the keyboard. The project verify skill (global /verify bootstraps here).
---

# Verify

There is no test suite (deliberate — quality gates are typecheck/lint/build plus your
eyes). Verification is: gates green, then drive the affected surface in the running app.

## 1. Gates

Run all three; they must be clean:

- `pnpm typecheck`
- `pnpm lint` (includes the `tokens-only/no-arbitrary-values` rule)
- `pnpm build`

On a fresh clone, run `pnpm build` once before `typecheck` — turbo `typecheck` depends on
`^build`.

## 2. Run it

`pnpm dev`, then open `http://localhost:5173`.

## 3. Route sweep (for shell-wide changes)

Load each and confirm nothing is clipped, mis-tokened, or broken:

`/` · `/onboarding` · `/app` · `/app/inbox` · `/app/approvals` ·
`/app/category/receipts` · `/app/thread/t-acme` · `/app/compose` · `/app/agents` ·
`/app/reminders` · `/app/settings` · `/talk` · `/design`

`/design` is the kitchen sink — the fastest way to catch a token regression across every
component at once.

## 4. Themes + keyboard

- Check **both themes**: Shift+T, or ⌘K → "Toggle theme".
- Keyboard spot-checks: ⌘K (palette), ⌘J (AI panel), `g i` / `g t` / `g a` (navigate),
  `c` (compose).

For a targeted change, drive the specific flow you touched rather than the whole sweep —
but always observe the real behavior, not just that the gates passed.
