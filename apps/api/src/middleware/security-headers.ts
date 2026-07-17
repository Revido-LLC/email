/**
 * `securityHeaders` — the global response-hardening middleware.
 *
 * Mounted first in `app.ts` so every response (health probe, Better Auth handler,
 * all routers, SSE streams) carries a strict, defense-in-depth header set. The API
 * only ever emits JSON / redirects / plain-text — it never serves a document that
 * loads sub-resources — so the CSP can be maximally strict (`default-src 'none'`)
 * without breaking anything. The web SPA gets its own, looser CSP (see
 * `apps/web/vite.config.ts`).
 *
 * Headers set:
 *  - `Content-Security-Policy` — nothing loads, nothing frames, no base/form hijack.
 *  - `X-Content-Type-Options: nosniff` — no MIME sniffing of JSON as HTML/JS.
 *  - `Referrer-Policy: no-referrer` — never leak the API URL (or an OAuth `code`).
 *  - `X-Frame-Options: DENY` (+ CSP `frame-ancestors 'none'`) — no clickjacking.
 *  - `Strict-Transport-Security` — pin TLS (no-op over plain HTTP, safe to always send).
 *  - `Cross-Origin-Opener-Policy` / `X-Permitted-Cross-Domain-Policies` / a locked
 *    `Permissions-Policy` — trim ambient capability.
 *
 * `Access-Control-Allow-Origin` is intentionally NOT touched here — cross-origin
 * SPA→API access is a CORS concern owned elsewhere; these headers never widen it.
 */
import { createMiddleware } from 'hono/factory'

/** A pure-API CSP: the service renders no document, so everything is denied. */
const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"

/** 180 days; `includeSubDomains` so every `*.revido.co` API host is pinned. */
const HSTS = 'max-age=15552000; includeSubDomains'

const PERMISSIONS_POLICY =
  'accelerometer=(), autoplay=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=(), browsing-topics=()'

export interface SecurityHeadersOptions {
  /** Emit HSTS. On by default; disable only for a plain-HTTP local edge. */
  hsts?: boolean
  /** Override the Content-Security-Policy (defaults to the pure-API policy). */
  csp?: string
}

/**
 * Build the response-hardening middleware. Headers are staged *before* `next()`
 * so they attach to streaming (SSE) responses too, not just buffered JSON.
 */
export function securityHeaders(options: SecurityHeadersOptions = {}) {
  const csp = options.csp ?? API_CSP
  const hsts = options.hsts ?? true
  return createMiddleware(async (c, next) => {
    c.header('Content-Security-Policy', csp)
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'no-referrer')
    c.header('X-Frame-Options', 'DENY')
    c.header('Cross-Origin-Opener-Policy', 'same-origin')
    c.header('X-Permitted-Cross-Domain-Policies', 'none')
    c.header('Permissions-Policy', PERMISSIONS_POLICY)
    if (hsts) c.header('Strict-Transport-Security', HSTS)
    await next()
  })
}
