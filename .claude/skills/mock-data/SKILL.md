---
name: mock-data
description: Use when you add mock data / change the data shape / add a field to Thread (or any `@revido/mock-data` type) — the package is the future API contract, so edit it contract-first.
---

# Mock data

`packages/mock-data` is a typed fake mailbox shaped like the *future* API. Screens treat
it as the data contract, so changes here are contract changes — make them deliberately.

## Contract-first

- `src/types.ts` is the future API shape. **Edit types before `src/data.ts`.** The data
  file just conforms to the interfaces.
- New fields on an existing interface (e.g. `Thread`, `CategoryMeta`) must be **optional**
  (`field?: T`) so existing rows and any real backend stay valid. Document the field with a
  doc comment saying where it surfaces in the UI.

## Denormalized read-model

- `Thread` already carries the AI output precomputed: `tldr`, `summary`, `extracted`,
  `badges`, `priorityScore`. Screens render these — they never derive them at render time.
- Expose data through a getter in `src/index.ts` that mirrors a future endpoint. Follow the
  existing pattern, e.g. `getNeedsYou()`, `getThreadsByCategory()`. Don't have screens
  import `THREADS` and filter inline.

## Conventions

- Ids are prefixed and stable: threads `t-*`, messages `m-*`, agents `ag-*`.
- All timestamps are ISO 8601 strings (`2026-07-15T08:12:00Z`).

## Categories are locked

The 9 `CategoryId`s are a locked design-system primitive. Adding or renaming one is not a
data edit — it touches `src/types.ts` (the union) + `src/categories.ts` (`CATEGORIES`) +
the `--cat-*` tokens in `packages/ui/src/styles/theme.css` + the enumerated class strings in
`packages/ui/src/components/category.tsx`. Flag this as a design change; don't freelance it.

## Worked example — a new optional field

Making Cmd-K match "invoice" to Receipts:

1. `src/types.ts` — add `keywords?: string[]` to `CategoryMeta` (doc comment: search
   synonyms surfaced in Cmd-K).
2. `src/categories.ts` — on the `receipts` entry: `keywords: ['invoice', 'invoices', 'billing']`.
3. Consume in the app (here, the palette `value` string) — see the `building-screens` skill.

Because the field is optional, no other category entry needs to change.

## Verify

`pnpm typecheck` runs project-wide and surfaces any contract break in the app immediately.
