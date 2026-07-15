/**
 * Live token foundation for the /design canvas. Everything here renders from the
 * GENERATED tokens (`@revido/ui/tokens`) — swap the ramp math in
 * `packages/ui/tokens/build-tokens.mjs`, regenerate, and this page moves with it.
 *
 * Swatch/scale demos use inline `style` (the ramp colors and pixel widths ARE the
 * subject matter, and aren't token utilities yet). All chrome uses token classes.
 */
import {
  RAMPS,
  TYPE_SCALE,
  SPACE_SCALE,
  SPACE_ALIASES,
  RADIUS_SCALE,
  CONTRAST_REPORT,
} from '@revido/ui/tokens'
import { Badge, Button, Sparkle, cn } from '@revido/ui'
import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground/70">{title}</h2>
      {hint && <p className="mb-4 mt-1 max-w-2xl text-sm text-muted-foreground">{hint}</p>}
      <div className={hint ? '' : 'mt-4'}>{children}</div>
    </section>
  )
}

/* ---- Color ramps: primitive scales, 50→900, with AA-for-text markers -------- */

function ColorRamps() {
  return (
    <div className="space-y-5">
      {RAMPS.map((ramp) => (
        <div key={ramp.name}>
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="font-mono text-sm font-medium">color.{ramp.name}</span>
            <span className="text-xs text-muted-foreground">{ramp.role}</span>
          </div>
          <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
            {ramp.steps.map((s) => (
              <div
                key={s.step}
                className="flex h-16 flex-col justify-between rounded-lg p-1.5"
                style={{ background: s.oklch, color: s.step <= 400 ? '#1c1917' : '#ffffff' }}
                title={`${ramp.name}.${s.step} · ${s.hex} · AA on light: ${s.contrast.lightBg}`}
              >
                <span className="text-2xs font-semibold">{s.step}</span>
                <span className="font-mono text-2xs opacity-80">{s.hex.replace('#', '')}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ---- The emphasis fix: same information, ranked vs. all-loud --------------- */

const ITEMS = [
  { who: 'John Rivera', what: 'Q3 proposal — needs sign-off', tone: 'action' },
  { who: 'QuickBooks', what: 'Invoice #1042 overdue', tone: 'error' },
  { who: 'Priya Nair', what: 'New inbound lead', tone: 'info' },
  { who: 'AWS', what: 'Bill $342.19 filed', tone: 'muted' },
  { who: 'Sarah Lindqvist', what: 'Logo set delivered', tone: 'muted' },
  { who: 'Vercel', what: 'Deploy succeeded', tone: 'muted' },
] as const

// "Before" = every row shouts a different saturated hue (today's screens).
const LOUD_HUE: Record<string, string> = {
  action: 'oklch(0.62 0.19 27)',
  error: 'oklch(0.58 0.2 18)',
  info: 'oklch(0.6 0.14 245)',
  muted: 'oklch(0.64 0.14 300)',
}

function EmphasisDemo() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-2xl border border-border p-4">
        <div className="mb-3 text-xs font-semibold text-destructive">Before — everything at full volume</div>
        <ul className="space-y-2">
          {ITEMS.map((it) => (
            <li key={it.who} className="flex items-center gap-2 text-sm">
              <span className="size-2 shrink-0 rounded-full" style={{ background: LOUD_HUE[it.tone] }} />
              <span className="font-medium" style={{ color: LOUD_HUE[it.tone] }}>
                {it.who}
              </span>
              <span className="truncate" style={{ color: LOUD_HUE[it.tone] }}>
                {it.what}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-2xs text-muted-foreground">Six hues compete; nothing leads.</p>
      </div>

      <div className="rounded-2xl border border-border p-4">
        <div className="mb-3 text-xs font-semibold text-success">After — one loud thing, the rest quiet</div>
        <ul className="space-y-2">
          {ITEMS.map((it, i) => (
            <li key={it.who} className="flex items-center gap-2 text-sm">
              {i === 0 ? (
                <span className="size-2 shrink-0 rounded-full bg-primary" />
              ) : it.tone === 'error' ? (
                <span className="size-2 shrink-0 rounded-full bg-destructive" />
              ) : (
                <span className="size-2 shrink-0 rounded-full bg-muted-foreground/40" />
              )}
              <span className={i === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}>{it.who}</span>
              <span className={i === 0 ? 'truncate text-foreground' : 'truncate text-muted-foreground'}>
                {it.what}
              </span>
              {i === 0 && (
                <Button size="sm" className="ml-auto">
                  Reply <ArrowRight />
                </Button>
              )}
              {it.tone === 'error' && i !== 0 && (
                <Badge variant="destructive" className="ml-auto">
                  Overdue
                </Badge>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-2xs text-muted-foreground">One primary action; danger kept for real danger; the rest recede.</p>
      </div>
    </div>
  )
}

/* ---- Materials: liquid glass over a busy monochrome field ------------------ */

const GLASS_PANELS = [
  {
    cls: 'glass',
    label: '.glass',
    hint: 'Flagship floating chrome — command palette, dialogs. blur(20px), specular top rim, soft depth.',
  },
  {
    cls: 'glass-thin',
    label: '.glass-thin',
    hint: 'Lighter weight for smaller surfaces — dropdown menus, toolbars. Less blur, no rim.',
  },
] as const

function GlassMaterials() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {GLASS_PANELS.map((m) => (
        <div
          key={m.label}
          className="relative h-64 overflow-hidden rounded-2xl border border-border bg-background"
        >
          {/* Busy monochrome backdrop the material frosts over. */}
          <div aria-hidden className="absolute inset-0 p-3">
            <div className="flex flex-wrap gap-x-2 gap-y-1 text-sm font-semibold uppercase leading-snug tracking-widest text-foreground/55">
              {Array.from({ length: 44 }).map((_, i) => (
                <span key={i}>Revido</span>
              ))}
            </div>
            <div className="absolute left-6 top-8 size-20 rounded-full bg-primary/70" />
            <div className="absolute right-8 top-12 size-16 rounded-2xl bg-neutral-500" />
            <div className="absolute bottom-8 left-16 size-24 rounded-full bg-muted-foreground/50" />
            <div className="absolute bottom-10 right-6 size-14 rounded-xl bg-neutral-700" />
          </div>

          {/* The floating glass panel — its backdrop-blur frosts the field above. */}
          <div
            className={cn(
              'absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-2xl p-4',
              m.cls,
            )}
          >
            <div className="flex items-center gap-2">
              <Sparkle className="text-ai" />
              <span className="font-mono text-sm font-medium">{m.label}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{m.hint}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ---- Type scale ----------------------------------------------------------- */

function TypeScaleView() {
  return (
    <div className="space-y-4">
      {TYPE_SCALE.map((t) => (
        <div key={t.key} className="flex items-baseline gap-4">
          <div className="w-28 shrink-0">
            <div className="font-mono text-xs font-medium">type.{t.key}</div>
            <div className="text-2xs text-muted-foreground">
              {t.size}/{t.line} · {t.weight} · {t.tracking}
            </div>
          </div>
          <div
            className="truncate"
            style={{
              fontSize: `${t.size}px`,
              lineHeight: `${t.line}px`,
              fontWeight: t.weight,
              letterSpacing: `${t.tracking}px`,
            }}
          >
            {t.display ? 'Your inbox, handled.' : t.use}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ---- Spacing scale (base-4) ----------------------------------------------- */

function SpacingScaleView() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        {SPACE_SCALE.filter((s) => s.px > 0).map((s) => (
          <div key={s.key} className="flex items-center gap-3">
            <span className="w-16 font-mono text-xs">space.{s.key}</span>
            <span className="h-3 rounded-sm bg-primary/70" style={{ width: `${s.px}px` }} />
            <span className="text-2xs text-muted-foreground">{s.px}px</span>
          </div>
        ))}
      </div>
      <div>
        <div className="mb-2 text-xs text-muted-foreground">Semantic aliases</div>
        <div className="flex flex-wrap gap-1.5">
          {SPACE_ALIASES.map((a) => (
            <span key={a.alias} className="rounded-md border border-border px-2 py-1 font-mono text-2xs">
              {a.alias} → space.{a.key} · {a.px}px
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---- Radius --------------------------------------------------------------- */

function RadiusView() {
  return (
    <div className="flex flex-wrap gap-4">
      {RADIUS_SCALE.map((r) => (
        <div key={r.key} className="text-center">
          <div
            className="size-16 border border-border bg-secondary"
            style={{ borderRadius: `${Math.min(r.px, 32)}px` }}
          />
          <div className="mt-1 font-mono text-2xs">radius.{r.key}</div>
          <div className="text-2xs text-muted-foreground">{r.px === 9999 ? 'full' : `${r.px}px`}</div>
        </div>
      ))}
    </div>
  )
}

/* ---- Contrast audit (WCAG 2.1), straight from the generator ---------------- */

function gradeClass(grade: string) {
  if (grade === 'AAA') return 'text-success'
  if (grade === 'AA') return 'text-success'
  if (grade === 'AA-large') return 'text-warning'
  return 'text-destructive'
}

function ContrastAudit() {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-left text-2xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-semibold">Pairing</th>
            <th className="px-3 py-2 font-semibold">Where</th>
            <th className="px-3 py-2 text-right font-semibold">Ratio</th>
            <th className="px-3 py-2 font-semibold">Grade</th>
          </tr>
        </thead>
        <tbody>
          {CONTRAST_REPORT.pairs.map((p) => (
            <tr key={p.label} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-2">{p.label}</td>
              <td className="px-3 py-2 text-muted-foreground">{p.on}</td>
              <td className="px-3 py-2 text-right font-mono">{p.ratio.toFixed(2)}</td>
              <td className={`px-3 py-2 font-semibold ${gradeClass(p.grade)}`}>{p.grade}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function TokenFoundation() {
  return (
    <div>
      <div className="mb-8 flex items-center gap-2 rounded-xl border border-ai/30 bg-ai/8 px-4 py-3 text-sm">
        <Sparkle className="text-ai" />
        <span>
          <span className="font-medium">Foundation, generated.</span>{' '}
          <span className="text-muted-foreground">
            Every value below comes from <span className="font-mono text-xs">packages/ui/tokens</span> — primitives →
            semantics, exportable to Tokens Studio &amp; Style Dictionary.
          </span>
        </span>
      </div>

      <Section title="Emphasis — the hierarchy fix" hint="Hierarchy is a property of a ramp, not a color. The same six inbox rows: all-loud (today) vs. ranked with emphasis tiers.">
        <EmphasisDemo />
      </Section>

      <Section title="Materials — liquid glass" hint="The depth layer for floating chrome: a translucent, frosted material that adapts to light and dark. Each panel sits over a busy monochrome field so the backdrop-blur is visibly frosting what's behind it.">
        <GlassMaterials />
      </Section>

      <Section title="Color ramps (primitive)" hint="OKLCH scales, 50→900. Hover a swatch for its AA contrast on the app canvas. Text roles are pinned to steps that clear AA 4.5.">
        <ColorRamps />
      </Section>

      <Section title="Contrast audit — WCAG 2.1" hint="Generated on every token build. A pairing that drops below AA is a build signal, not a surprise in production.">
        <ContrastAudit />
      </Section>

      <Section title="Type scale">
        <TypeScaleView />
      </Section>

      <Section title="Spacing — base-4">
        <SpacingScaleView />
      </Section>

      <Section title="Radius">
        <RadiusView />
      </Section>
    </div>
  )
}
