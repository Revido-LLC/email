/**
 * The Hono app (Railway stack).
 *
 * Wires four things and nothing else — this is the foundation api-service builds
 * on, not the CRUD surface:
 *   1. strict security headers (CSP, HSTS, nosniff…) on every response;
 *   2. the Better Auth handler at `/api/auth/*` (sign-in, callbacks, session);
 *   3. a public `/health` probe;
 *   4. every router registered in `./routes` (empty for now — the api-service seam).
 *
 * `hono/client` (`hc`) consumes the exported `AppType` for end-to-end types.
 */
import { Hono } from 'hono'
import { auth } from './auth'
import { apiCors } from './middleware/cors'
import { securityHeaders } from './middleware/security-headers'
import { routers } from './routes'

export const app = new Hono()

// Harden every response (including /health, the Better Auth handler, and SSE
// streams) before anything else runs.
app.use('*', securityHeaders())
// The SPA lives on a sibling host. Permit only its configured origin and allow
// the Better Auth session cookie to accompany browser API requests.
app.use('*', apiCors())

// Better Auth owns everything under /api/auth/* (GET + POST).
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))

// Liveness probe.
app.get('/health', (c) => c.json({ ok: true, service: 'api' }))

// The api-service seam: mount each registered router.
for (const r of routers) {
  app.route(r.path, r.router)
}

/** The router type consumed by the frontend `hc` client. */
export type AppType = typeof app
