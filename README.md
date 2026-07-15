# Revido Mail

**Your inbox, handled.** A free, web-based AI email client — built by [Revido](https://revido.co).

> This repository is the open-source UI shell. It renders every screen as a real React view over a
> mock-data module. No backend, no OAuth, no AI calls yet — those are a later planning pass.

## Stack

- **Vite + React + TypeScript** SPA (`apps/web`), routed with **TanStack Router** (file-based).
- **Tailwind v4** with CSS-variable design tokens — a warm, consumer theme (`packages/ui`).
- **Mock data** shaped like the future API (`packages/mock-data`).
- Component library built on Radix primitives (shadcn-registry lineage), `cmdk`, `motion`, Tiptap.

## Getting started

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

Key routes:

| Route             | Screen                                   |
| ----------------- | ---------------------------------------- |
| `/`               | Landing page                             |
| `/onboarding`     | 30-second first-run wow                  |
| `/app`            | Today (AI morning brief)                 |
| `/app/inbox`      | Thread list — Needs You                  |
| `/app/thread/:id` | Thread takeover                          |
| `/app/compose`    | Composer (prompt bar + tone chips)       |
| `/app/agents`     | Inbox agents (gallery / create / feed)   |
| `/app/reminders`  | Reminders                                |
| `/app/settings`   | Settings                                 |
| `/talk`           | Talk to Revido                           |
| `/design`         | Kitchen-sink: tokens + component gallery |

## Scripts

- `pnpm dev` · `pnpm build` · `pnpm typecheck` · `pnpm lint` · `pnpm format`

## License

[AGPL-3.0](./LICENSE) — don't trust us, read the code.
