/**
 * Style Dictionary v4 build config for the Revido Mail tokens.
 *
 * The token JSON in this folder is DTCG format ($type/$value) with Tokens
 * Studio alias syntax ({primitive.color.brand.700}), which SD v4 reads natively.
 * This config is intentionally dependency-light: it isn't wired into `pnpm build`
 * (the app consumes tokens.generated.ts directly). It exists so the same source
 * of truth can fan out to any downstream platform.
 *
 * Build:  npx style-dictionary@4 build --config packages/ui/tokens/style-dictionary.config.mjs
 * Output: packages/ui/tokens/dist/{css,js,json}
 */
export default {
  source: [
    'packages/ui/tokens/primitive.tokens.json',
    'packages/ui/tokens/semantic.tokens.json',
  ],
  platforms: {
    css: {
      transformGroup: 'css',
      buildPath: 'packages/ui/tokens/dist/css/',
      files: [
        {
          destination: 'primitives.css',
          format: 'css/variables',
          filter: (t) => t.filePath.includes('primitive'),
          options: { outputReferences: true },
        },
        {
          destination: 'semantic.css',
          format: 'css/variables',
          filter: (t) => t.filePath.includes('semantic'),
          options: { outputReferences: true },
        },
      ],
    },
    js: {
      transformGroup: 'js',
      buildPath: 'packages/ui/tokens/dist/js/',
      files: [{ destination: 'tokens.js', format: 'javascript/es6' }],
    },
    json: {
      transformGroup: 'js',
      buildPath: 'packages/ui/tokens/dist/json/',
      files: [{ destination: 'tokens.flat.json', format: 'json/flat' }],
    },
  },
}
