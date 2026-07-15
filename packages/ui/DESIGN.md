# Revido Mail — Design System

**Warm consumer skin, pro-tool bones.** Friendly, soft, colorful, illustrated — with the speed and
keyboard coverage of a pro tool underneath. Read this before building any screen.

## Golden rule: tokens only

Style with **token utilities**, never arbitrary Tailwind values.

- ✅ `bg-primary`, `text-muted-foreground`, `border-border`, `rounded-2xl`, `bg-cat-newsletters/12`
- ❌ `bg-[#ff5a5f]`, `w-[327px]`, `text-[13px]`

The ESLint rule `tokens-only/no-arbitrary-values` flags violations. If you need a value that no token
covers, add a token to `src/styles/theme.css` rather than inlining it.

## Color tokens (semantic — auto light/dark)

| Token                         | Use                                       |
| ----------------------------- | ----------------------------------------- |
| `background`                  | app canvas (warm off-white / warm dark)   |
| `foreground`                  | primary text                              |
| `card` / `popover`            | raised surfaces                           |
| `muted` / `subtle`            | quiet fills, hover states                 |
| `muted-foreground`            | secondary text                            |
| `border` / `input`            | hairlines, field borders                  |
| `primary`                     | **coral** — the signature action color    |
| `accent`                      | **amber** — warm highlights, illustration |
| `secondary`                   | neutral chips/buttons                     |
| `success/warning/destructive` | status                                    |
| `ai`                          | **violet** — AI marker (sparkle, AI tags) |

Every color has a matching `*-foreground`. Opacity modifiers work: `bg-primary/12`, `text-ai/70`.

## Category color system

Nine categories, each with a token stem. Utilities: `bg-cat-<token>`, `text-cat-<token>`, plus soft
variants like `bg-cat-<token>/12`. Prefer the `<CategoryChip>` / `<CategoryDot>` components, which map
the stem for you (the class strings are enumerated in `components/category.tsx` so Tailwind sees them).

`to-reply`·coral | `awaiting-reply`·amber | `newsletters`·lavender | `receipts`·green |
`notifications`·slate | `promotions`·pink | `personal`·teal | `fyi`·gray | `calendar`·blue

## Type

- **Display** (`font-display`, Fraunces): greetings, screen titles, hero, empty-state headings.
- **Body/UI** (default `font-sans`, Inter): everything else.
- Sizes are the Tailwind scale plus `text-2xs` (0.6875rem) for tiny meta/labels.

## Shape & elevation

- Radius is tight and modern — crisp without going brutalist: `rounded-xl` (buttons/inputs), `rounded-2xl` (cards), `rounded-3xl` (hero/marketing).
- Shadows: `shadow-soft` (resting cards, buttons), `shadow-pop` (popovers, dialogs, command palette).

## The AI marker

Every AI-generated element carries a **sparkle**. Use `<Sparkle/>` inline before AI copy, or `<AiTag/>`
as a small labeled pill. TL;DRs, summaries, suggested replies, agent reasoning → all get marked.

## Component inventory (`@revido/ui`)

`Button` (variants: primary, secondary, outline, ghost, subtle, ai, destructive, link · sizes: sm, md,
lg, icon, icon-sm) · `Card` (+Header/Title/Description/Content/Footer) · `Badge` · `CategoryChip` ·
`CategoryDot` · `PriorityDot` · `Sparkle` · `AiTag` · `Input` · `Textarea` · `Label` · `Kbd` ·
`Skeleton` · `Separator` · `Switch` · `Checkbox` · `Progress` · `EmptyState` · `Avatar` (+`ContactAvatar`) ·
`Tabs` · `Tooltip` (+`SimpleTooltip`) · `Dialog` · `ScrollArea` · `DropdownMenu`.

Utilities: `cn(...)` (class merge), `initials(name)`.

Icons: `lucide-react`. Category/agent icon names are stored as strings in mock-data; resolve them via
a lucide icon map in the app layer.

## Motion

`tw-animate-css` is loaded — use `animate-in fade-in-0 zoom-in-95` etc. Keep motion quick and subtle
(150–250ms). Prefer optimistic, instant transitions; the product should feel _fast_.
