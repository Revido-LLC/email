/**
 * Revido Mail — design token generator.
 *
 * Single source of truth for the color/space/type/radius/shadow primitives.
 * Ramps are defined in OKLCH (perceptually even lightness), then this script:
 *   1. converts each step to sRGB hex,
 *   2. computes WCAG 2.1 contrast ratios against the real app backgrounds,
 *   3. emits DTCG-format JSON (Tokens Studio + Style Dictionary v4 both read it),
 *   4. emits a typed `tokens.generated.ts` the /design canvas renders live.
 *
 * Run: `node packages/ui/tokens/build-tokens.mjs`  (no dependencies)
 *
 * Tokens are GENERATED — never hand-edit the JSON or the .ts. Edit the ramp
 * definitions below and re-run. That's the whole point of a scale: consistency
 * is mechanical, not a matter of taste per swatch.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT = dirname(fileURLToPath(import.meta.url))

/* ----------------------------------------------------------------------------
 * Color math: OKLCH -> OKLab -> linear sRGB -> gamma sRGB -> hex, and WCAG.
 * -------------------------------------------------------------------------- */

function oklchToLinearSrgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

const gamma = (c) => {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
  return Math.min(1, Math.max(0, v))
}

function oklchToHex(L, C, h) {
  const [r, g, b] = oklchToLinearSrgb(L, C, h).map(gamma)
  const to255 = (c) => Math.round(c * 255)
  const hex = (c) => to255(c).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

// WCAG 2.1 relative luminance from a gamma sRGB hex.
function relLuminance(hex) {
  const n = parseInt(hex.slice(1), 16)
  const chan = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2]
}

function contrast(hexA, hexB) {
  const a = relLuminance(hexA)
  const b = relLuminance(hexB)
  const [hi, lo] = a >= b ? [a, b] : [b, a]
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
}

/* ----------------------------------------------------------------------------
 * Ramp definitions. Shared perceptual lightness ladder + a chroma bell (peak at
 * 500), scaled per family. Neutral gets its own flatter, low-chroma ladder.
 * -------------------------------------------------------------------------- */

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]

// prettier-ignore
const L_CHROMATIC = { 50:0.985, 100:0.962, 200:0.922, 300:0.864, 400:0.778, 500:0.688, 600:0.612, 700:0.532, 800:0.450, 900:0.366 }
// prettier-ignore
const C_FRACTION  = { 50:0.22,  100:0.34,  200:0.56,  300:0.78,  400:0.93,  500:1.00,  600:0.99,  700:0.92,  800:0.80,  900:0.64 }

// prettier-ignore
const L_NEUTRAL   = { 50:0.986, 100:0.966, 200:0.928, 300:0.882, 400:0.744, 500:0.606, 600:0.500, 700:0.412, 800:0.312, 900:0.224 }
// prettier-ignore
const C_NEUTRAL   = { 50:0.004, 100:0.006, 200:0.008, 300:0.010, 400:0.012, 500:0.014, 600:0.014, 700:0.014, 800:0.016, 900:0.018 }

/** family -> { hue, peakChroma, label, role } */
const FAMILIES = {
  brand:   { hue: 27,  peak: 0.190, label: 'Brand · Coral',   role: 'Primary action, brand signature' },
  amber:   { hue: 68,  peak: 0.145, label: 'Amber',           role: 'Secondary / warm highlight' },
  neutral: { hue: 72,  peak: 0,     label: 'Neutral · Warm',  role: 'Text, surfaces, borders', neutral: true },
  success: { hue: 150, peak: 0.150, label: 'Success · Green',  role: 'Positive / paid / done' },
  warning: { hue: 85,  peak: 0.165, label: 'Warning · Gold',   role: 'Caution / due soon' },
  error:   { hue: 18,  peak: 0.205, label: 'Error · Red',      role: 'Destructive / overdue' },
  info:    { hue: 245, peak: 0.140, label: 'Info · Blue',      role: 'Informational / calendar' },
  ai:      { hue: 300, peak: 0.185, label: 'AI · Violet',      role: 'AI-generated marker (reserve it)' },
}

// Reference backgrounds/inks, taken from the real theme.css so contrast is honest.
const REF = {
  lightBg: oklchToHex(0.994, 0.005, 85), // --background (light)
  darkBg: oklchToHex(0.2, 0.012, 55), // --background (dark)
  white: '#ffffff',
}

function buildRamp(name, def) {
  const Lmap = def.neutral ? L_NEUTRAL : L_CHROMATIC
  const steps = STEPS.map((step) => {
    const L = Lmap[step]
    const C = def.neutral ? C_NEUTRAL[step] : def.peak * C_FRACTION[step]
    const hex = oklchToHex(L, C, def.hue)
    const oklch = `oklch(${L} ${+C.toFixed(4)} ${def.hue})`
    const onLightBg = contrast(hex, REF.lightBg)
    const onDarkBg = contrast(hex, REF.darkBg)
    return {
      step,
      oklch,
      hex,
      contrast: {
        white: contrast(hex, REF.white),
        lightBg: onLightBg,
        darkBg: onDarkBg,
      },
      // Can this step carry normal-size body text (AA >= 4.5) on the app canvas?
      aaTextOnLight: onLightBg >= 4.5,
      aaTextOnDark: onDarkBg >= 4.5,
    }
  })
  return { name, hue: def.hue, label: def.label, role: def.role, neutral: !!def.neutral, steps }
}

const ramps = Object.entries(FAMILIES).map(([name, def]) => buildRamp(name, def))
const rampByName = Object.fromEntries(ramps.map((r) => [r.name, r]))
const hexOf = (name, step) => rampByName[name].steps.find((s) => s.step === step).hex

/* ----------------------------------------------------------------------------
 * Spacing, radius, type, shadow primitives (base-4 spacing).
 * -------------------------------------------------------------------------- */

const SPACE = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64, 20: 80, 24: 96 }
const SPACE_ALIAS = { '3xs': 1, '2xs': 2, xs: 3, sm: 4, md: 6, lg: 8, xl: 12, '2xl': 16, '3xl': 24 } // -> SPACE key
const RADIUS = { sm: 4, md: 6, lg: 8, xl: 10, '2xl': 14, '3xl': 20, full: 9999 }
const TYPE = {
  '2xs': { size: 11, line: 16, weight: 500, tracking: 0.2, use: 'meta, badges, kbd' },
  xs: { size: 12, line: 16, weight: 400, tracking: 0, use: 'dense labels, chips' },
  sm: { size: 14, line: 20, weight: 400, tracking: 0, use: 'secondary / supporting body' },
  base: { size: 16, line: 24, weight: 400, tracking: 0, use: 'body' },
  lg: { size: 18, line: 28, weight: 500, tracking: -0.1, use: 'lead paragraph, list titles' },
  xl: { size: 20, line: 28, weight: 600, tracking: -0.2, use: 'section heading (sans)' },
  '2xl': { size: 24, line: 32, weight: 600, tracking: -0.3, use: 'card / panel title' },
  'display-sm': { size: 30, line: 36, weight: 600, tracking: -0.4, use: 'screen title (Fraunces)', family: 'display' },
  'display-md': { size: 38, line: 44, weight: 600, tracking: -0.5, use: 'greeting (Fraunces)', family: 'display' },
  'display-lg': { size: 52, line: 56, weight: 600, tracking: -1, use: 'hero (Fraunces)', family: 'display' },
}

/* ----------------------------------------------------------------------------
 * Emit 1: DTCG primitive tokens  (Tokens Studio + Style Dictionary v4).
 * -------------------------------------------------------------------------- */

const color = {}
for (const r of ramps) {
  color[r.name] = {}
  for (const s of r.steps) {
    color[r.name][s.step] = {
      $type: 'color',
      $value: s.hex,
      $extensions: { 'studio.tokens': { oklch: s.oklch }, 'com.revido': { aaTextOnLight: s.aaTextOnLight } },
    }
  }
}
const dim = (px) => ({ $type: 'dimension', $value: `${px}px` })
const primitive = {
  color,
  space: Object.fromEntries(Object.entries(SPACE).map(([k, v]) => [k, dim(v)])),
  radius: Object.fromEntries(Object.entries(RADIUS).map(([k, v]) => [k, dim(v)])),
  font: {
    family: {
      sans: { $type: 'fontFamily', $value: 'Inter, ui-sans-serif, system-ui, sans-serif' },
      display: { $type: 'fontFamily', $value: 'Fraunces, Iowan Old Style, Georgia, serif' },
    },
    weight: {
      regular: { $type: 'fontWeight', $value: 400 },
      medium: { $type: 'fontWeight', $value: 500 },
      semibold: { $type: 'fontWeight', $value: 600 },
    },
  },
  type: Object.fromEntries(
    Object.entries(TYPE).map(([k, t]) => [
      k,
      {
        $type: 'typography',
        $value: {
          fontFamily: t.family === 'display' ? '{primitive.font.family.display}' : '{primitive.font.family.sans}',
          fontWeight: t.weight,
          fontSize: `${t.size}px`,
          lineHeight: `${t.line}px`,
          letterSpacing: `${t.tracking}px`,
        },
        $description: t.use,
      },
    ]),
  ),
  shadow: {
    soft: { $type: 'shadow', $value: '0 1px 2px rgba(120,90,70,0.04), 0 8px 24px -12px rgba(120,90,70,0.16)' },
    pop: { $type: 'shadow', $value: '0 4px 12px -2px rgba(120,90,70,0.08), 0 16px 40px -12px rgba(120,90,70,0.22)' },
  },
}

/* ----------------------------------------------------------------------------
 * Emit 2: DTCG semantic tokens — roles + EMPHASIS tiers (the hierarchy fix).
 * Light + dark sets alias primitive steps. This layer is where "loud/quiet"
 * lives, so components ask for a role, never a raw ramp step.
 * -------------------------------------------------------------------------- */

const ref = (path) => ({ $value: `{primitive.${path}}` })
const semantic = {
  light: {
    bg: { canvas: ref('color.neutral.50'), raised: ref('color.neutral.50'), sunken: ref('color.neutral.100') },
    text: {
      primary: ref('color.neutral.900'),
      secondary: ref('color.neutral.700'),
      muted: ref('color.neutral.600'),
      onBrand: ref('color.neutral.50'),
    },
    border: { subtle: ref('color.neutral.200'), strong: ref('color.neutral.300') },
    // Emphasis: the same brand hue at three volumes. `loud` is brand.700 (not
    // 600) so a white label clears AA 4.5 — vibrancy stays in the ramp, the
    // clickable fill takes the AA-safe step.
    action: {
      loud: ref('color.brand.700'),
      loudHover: ref('color.brand.800'),
      quietFill: ref('color.brand.100'),
      quietText: ref('color.brand.700'),
    },
    status: {
      successText: ref('color.success.700'), successFill: ref('color.success.100'),
      warningText: ref('color.warning.800'), warningFill: ref('color.warning.100'),
      errorText: ref('color.error.600'), errorFill: ref('color.error.100'),
      infoText: ref('color.info.700'), infoFill: ref('color.info.100'),
    },
    ai: { text: ref('color.ai.700'), fill: ref('color.ai.100') },
  },
  dark: {
    bg: { canvas: ref('color.neutral.900'), raised: ref('color.neutral.800'), sunken: ref('color.neutral.900') },
    text: {
      primary: ref('color.neutral.100'),
      secondary: ref('color.neutral.300'),
      muted: ref('color.neutral.400'),
      onBrand: ref('color.neutral.900'),
    },
    border: { subtle: ref('color.neutral.700'), strong: ref('color.neutral.600') },
    action: {
      loud: ref('color.brand.500'),
      loudHover: ref('color.brand.400'),
      quietFill: ref('color.brand.900'),
      quietText: ref('color.brand.300'),
    },
    status: {
      successText: ref('color.success.400'), successFill: ref('color.success.900'),
      warningText: ref('color.warning.400'), warningFill: ref('color.warning.900'),
      errorText: ref('color.error.400'), errorFill: ref('color.error.900'),
      infoText: ref('color.info.400'), infoFill: ref('color.info.900'),
    },
    ai: { text: ref('color.ai.400'), fill: ref('color.ai.900') },
  },
  space: Object.fromEntries(Object.entries(SPACE_ALIAS).map(([k, v]) => [k, { $value: `{primitive.space.${v}}` }])),
}

/* ----------------------------------------------------------------------------
 * Emit 3: contrast report — key text-on-background pairings vs WCAG AA/AAA.
 * -------------------------------------------------------------------------- */

const AA = 4.5
const AA_LARGE = 3
const grade = (r) => (r >= 7 ? 'AAA' : r >= AA ? 'AA' : r >= AA_LARGE ? 'AA-large' : 'fail')
const pairs = [
  ['primary label — neutral.50 on brand.700', hexOf('neutral', 50), hexOf('brand', 700), 'primary button (light)'],
  ['primary label — neutral.900 on brand.500', hexOf('neutral', 900), hexOf('brand', 500), 'primary button (dark)'],
  ['text.primary — neutral.900', hexOf('neutral', 900), REF.lightBg, 'light canvas'],
  ['text.secondary — neutral.700', hexOf('neutral', 700), REF.lightBg, 'light canvas'],
  ['text.muted — neutral.600', hexOf('neutral', 600), REF.lightBg, 'light canvas'],
  ['text.secondary dark — neutral.300', hexOf('neutral', 300), REF.darkBg, 'dark canvas'],
  ['action.quietText — brand.700 on brand.100', hexOf('brand', 700), hexOf('brand', 100), 'quiet chip'],
  ['error.700 text', hexOf('error', 700), REF.lightBg, 'light canvas'],
  ['success.700 text', hexOf('success', 700), REF.lightBg, 'light canvas'],
  ['warning.800 text', hexOf('warning', 800), REF.lightBg, 'light canvas'],
  ['info.700 text', hexOf('info', 700), REF.lightBg, 'light canvas'],
  ['ai.700 text', hexOf('ai', 700), REF.lightBg, 'light canvas'],
]
const contrastReport = {
  reference: REF,
  standard: 'WCAG 2.1 — AA 4.5 (normal), 3.0 (large), AAA 7.0',
  pairs: pairs.map(([label, fg, bg, on]) => {
    const ratio = contrast(fg, bg)
    return { label, on, fg, bg, ratio, grade: grade(ratio) }
  }),
  // full per-step matrix vs both canvases, for the audit table on /design
  ramps: Object.fromEntries(
    ramps.map((r) => [r.name, r.steps.map((s) => ({ step: s.step, hex: s.hex, onLight: s.contrast.lightBg, onDark: s.contrast.darkBg }))]),
  ),
}

/* ----------------------------------------------------------------------------
 * Emit 4: typed tokens.generated.ts for the live /design canvas.
 * -------------------------------------------------------------------------- */

const ts = `/* eslint-disable */
// AUTO-GENERATED by tokens/build-tokens.mjs — do not edit by hand.
// Run \`node packages/ui/tokens/build-tokens.mjs\` to regenerate.

export interface RampStep {
  step: number
  oklch: string
  hex: string
  contrast: { white: number; lightBg: number; darkBg: number }
  aaTextOnLight: boolean
  aaTextOnDark: boolean
}
export interface Ramp {
  name: string
  hue: number
  label: string
  role: string
  neutral: boolean
  steps: RampStep[]
}

export const RAMPS: Ramp[] = ${JSON.stringify(ramps, null, 2)}

export const SPACE_SCALE: { key: string; px: number }[] = ${JSON.stringify(
  Object.entries(SPACE).map(([k, v]) => ({ key: k, px: v })),
  null,
  2,
)}
export const SPACE_ALIASES: { alias: string; key: string; px: number }[] = ${JSON.stringify(
  Object.entries(SPACE_ALIAS).map(([alias, key]) => ({ alias, key: String(key), px: SPACE[key] })),
  null,
  2,
)}
export const RADIUS_SCALE: { key: string; px: number }[] = ${JSON.stringify(
  Object.entries(RADIUS).map(([k, v]) => ({ key: k, px: v })),
  null,
  2,
)}
export const TYPE_SCALE: { key: string; size: number; line: number; weight: number; tracking: number; use: string; display: boolean }[] = ${JSON.stringify(
  Object.entries(TYPE).map(([k, t]) => ({
    key: k,
    size: t.size,
    line: t.line,
    weight: t.weight,
    tracking: t.tracking,
    use: t.use,
    display: t.family === 'display',
  })),
  null,
  2,
)}
export const CONTRAST_REPORT = ${JSON.stringify(contrastReport, null, 2)} as const
`

/* ----------------------------------------------------------------------------
 * Write all outputs.
 * -------------------------------------------------------------------------- */

const files = {
  'primitive.tokens.json': JSON.stringify({ primitive }, null, 2),
  'semantic.tokens.json': JSON.stringify({ semantic }, null, 2),
  'contrast.report.json': JSON.stringify(contrastReport, null, 2),
  'tokens.generated.ts': ts,
}
for (const [file, content] of Object.entries(files)) {
  writeFileSync(join(OUT, file), content + '\n')
}

// Console summary — a quick contrast audit right in the terminal.
console.log('Generated tokens:\n  ' + Object.keys(files).join('\n  '))
console.log('\nContrast audit (key pairings, WCAG 2.1):')
for (const p of contrastReport.pairs) {
  const flag = p.grade === 'fail' ? '  ✗' : p.grade.startsWith('AA') ? '  ✓' : '  ·'
  console.log(`${flag} ${p.ratio.toFixed(2).padStart(5)}  ${p.grade.padEnd(9)} ${p.label}  (${p.on})`)
}
