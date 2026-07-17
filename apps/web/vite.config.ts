import { fileURLToPath } from 'node:url'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Origin of the API, derived from the build-time `VITE_API_URL`. Empty for a
 * same-origin deploy (where `'self'` already covers the API). Added to
 * `connect-src` so the SPA's fetch/SSE calls to a separately-hosted API pass CSP.
 */
const apiOrigin = (() => {
  const raw = process.env.VITE_API_URL
  if (!raw) return ''
  try {
    return new URL(raw).origin
  } catch {
    return ''
  }
})()

/**
 * Content-Security-Policy for the SPA.
 *
 *  - `script-src 'self'` — the production build emits only same-origin module
 *    scripts (no inline scripts), so no `'unsafe-inline'`/`'unsafe-eval'` needed.
 *  - `style-src 'unsafe-inline'` — Tailwind + component libs inject runtime styles;
 *    plus the Google Fonts stylesheet host.
 *  - `img-src … https:` — sender avatars come from arbitrary provider CDNs. This is
 *    app CHROME only; the tracking-pixel surface (email bodies) is isolated in the
 *    render iframe with its own, far stricter `img-src` (see email-frame.tsx).
 *  - `connect-src` — same origin plus the API origin for fetch/SSE + Better Auth.
 *  - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` — lock the rest.
 *
 * `frame-ancestors`/HSTS can't ride in a `<meta>`, so they're header-only (below).
 */
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ''}`,
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
]

/** Meta-tag form (no `frame-ancestors` — ignored in `<meta>`). */
const META_CSP = CSP_DIRECTIVES.join('; ')
/** Header form adds `frame-ancestors 'none'` (only meaningful as a real header). */
const HEADER_CSP = [...CSP_DIRECTIVES, "frame-ancestors 'none'"].join('; ')

/**
 * Real security headers, applied when the built app is served via `vite preview`
 * (the production serve command). Not applied to the dev server — a strict CSP
 * would break Vite HMR's inline scripts.
 */
const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': HEADER_CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=15552000; includeSubDomains',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), browsing-topics=()',
}

/**
 * Inject the CSP `<meta>` into the built `index.html` (build only, so dev HMR is
 * untouched). Defense-in-depth for any static host that doesn't send the header.
 */
function cspMetaPlugin(): Plugin {
  return {
    name: 'revido-csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${META_CSP}" />`,
      )
    },
  }
}

export default defineConfig({
  plugins: [
    // Router plugin must run before the React plugin.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    cspMetaPlugin(),
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
    // The production serve path: emit the real security headers here.
    headers: SECURITY_HEADERS,
  },
})
