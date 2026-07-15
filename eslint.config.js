// @ts-check
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

/**
 * Local rule: tokens-only Tailwind.
 *
 * The design system is enforced mechanically — components must style with
 * CSS-variable-backed token utilities (e.g. `bg-primary`, `text-muted-foreground`),
 * never with arbitrary Tailwind values like `bg-[#ff5a5f]` or `w-[327px]`.
 * This keeps warm-theme tokens as the single source of truth (see packages/ui/DESIGN.md).
 */
// Strip Tailwind variant prefixes (e.g. `data-[state=checked]:`, `hover:`, `sm:`)
// and inspect only the base utility. A colon at bracket-depth 0 ends a variant.
function baseUtility(cls) {
  let depth = 0
  let cut = -1
  for (let i = 0; i < cls.length; i++) {
    const ch = cls[i]
    if (ch === '[') depth++
    else if (ch === ']') depth = Math.max(0, depth - 1)
    else if (ch === ':' && depth === 0) cut = i
  }
  return cls.slice(cut + 1)
}
// True arbitrary value: the base utility itself uses `-[…]` or is a bare `[…]`
// arbitrary property. Variant brackets (`data-[…]:token`) are NOT arbitrary values.
const arbitraryValue = /(^|-)\[[^\]]+\]$/
const tokensOnly = {
  rules: {
    'no-arbitrary-values': {
      meta: {
        type: 'suggestion',
        docs: { description: 'Disallow arbitrary Tailwind values; use design tokens instead.' },
        schema: [],
        messages: {
          arbitrary:
            'Arbitrary Tailwind value "{{cls}}" — use a design token utility instead (see packages/ui/DESIGN.md).',
        },
      },
      /** @param {import('eslint').Rule.RuleContext} context */
      create(context) {
        /** @param {string} raw @param {any} node */
        const scan = (raw, node) => {
          for (const cls of raw.split(/\s+/)) {
            if (!cls) continue
            if (arbitraryValue.test(baseUtility(cls))) {
              context.report({ node, messageId: 'arbitrary', data: { cls } })
            }
          }
        }
        return {
          JSXAttribute(node) {
            if (
              node.name.type !== 'JSXIdentifier' ||
              !['className', 'class'].includes(node.name.name)
            )
              return
            const v = node.value
            if (v && v.type === 'Literal' && typeof v.value === 'string') scan(v.value, v)
          },
          Literal(node) {
            // string args to cn()/clsx()/cva()
            const p = node.parent
            if (
              p &&
              p.type === 'CallExpression' &&
              p.callee.type === 'Identifier' &&
              ['cn', 'clsx', 'cva', 'twMerge'].includes(p.callee.name) &&
              typeof node.value === 'string'
            )
              scan(node.value, node)
          },
        }
      },
    },
  },
}

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/routeTree.gen.ts',
      '**/.turbo/**',
      'eslint.config.js',
      // Generated tokens + their build tooling — the source of truth is the ramp
      // math in build-tokens.mjs, regenerated, not linted by hand.
      '**/tokens/*.mjs',
      '**/tokens/tokens.generated.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'tokens-only': tokensOnly,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'tokens-only/no-arbitrary-values': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
