# Design tokens

Single source of truth for Revido Mail's primitives and semantics. **Everything
here is generated** — edit the ramp/scale definitions in `build-tokens.mjs`, then
regenerate. Never hand-edit the JSON or the `.ts`.

```bash
node packages/ui/tokens/build-tokens.mjs
```

## What's in here

| File                     | Format                | Consumed by                                  |
| ------------------------ | --------------------- | -------------------------------------------- |
| `build-tokens.mjs`       | generator (Node, 0 deps) | you — the source of truth                 |
| `primitive.tokens.json`  | DTCG (`$type`/`$value`) | Tokens Studio · Style Dictionary            |
| `semantic.tokens.json`   | DTCG, alias refs      | Tokens Studio · Style Dictionary             |
| `contrast.report.json`   | plain JSON            | the `/design` audit table · CI a11y checks   |
| `tokens.generated.ts`    | typed TS              | the app (`@revido/ui/tokens`), live canvas   |
| `style-dictionary.config.mjs` | SD v4 config     | `npx style-dictionary build`                 |

## Three tiers

1. **Primitive** — the raw scales. `color.brand.700`, `space.4`, `radius.lg`,
   `type.lg`. OKLCH-defined, no meaning attached. Type is **Inter only** — one family, sized on
   the Tailwind scale; there's no display serif and no `display-*` tier. Hierarchy comes from size
   and weight (e.g. screen titles are `text-lg font-semibold`, the one big greeting is `text-2xl`).
2. **Semantic** — roles that alias primitives, split into `light`/`dark` sets.
   This is where **emphasis** lives: `action.loud` / `action.quietFill`,
   `text.primary` / `text.muted`. Components ask for a role, never a raw step.
3. **Component** — per-component overrides (added as components graduate).

## Using it in Tokens Studio

Import the two `*.tokens.json` files as token sets (primitive as the base,
semantic on top). The `light`/`semantic` and `dark`/`semantic` groups map to
Tokens Studio themes. Alias references (`{primitive.color.brand.700}`) resolve
automatically.

## Using it in Style Dictionary

```bash
npx style-dictionary@4 build --config packages/ui/tokens/style-dictionary.config.mjs
```

Outputs CSS custom properties, an ES module, and a flat JSON to `dist/`.
`outputReferences` is on, so the emitted CSS keeps `var(--primitive-...)`
aliases instead of flattening to hex — the semantic layer stays legible.

## Accessibility

`build-tokens.mjs` computes WCAG 2.1 contrast for every ramp step against the
real app canvases and every semantic text/label pairing. The audit prints on
every run and is written to `contrast.report.json`. **A ramp change that drops a
text role below AA (4.5) is visible immediately** — treat a `fail` in the audit
as a build error.
