import { fileURLToPath } from 'node:url'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    // Router plugin must run before the React plugin.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // `.up.railway.app` allows the Railway-generated subdomain; `.revido.co`
  // allows the production custom domain (email.revido.co) and any sibling.
  // Railway assigns `$PORT` at runtime, so both dev and preview servers must
  // bind to it rather than the hardcoded default.
  server: {
    port: Number(process.env.PORT) || 5173,
    host: true,
    allowedHosts: ['.up.railway.app', '.revido.co'],
  },
  preview: {
    port: Number(process.env.PORT) || 5173,
    host: true,
    allowedHosts: ['.up.railway.app', '.revido.co'],
  },
})
