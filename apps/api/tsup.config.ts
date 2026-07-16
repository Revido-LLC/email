import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  // Bundle the workspace packages (source-exported) into the app output.
  noExternal: [/^@revido\//],
})
