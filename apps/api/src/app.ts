/**
 * The Hono app (Railway stack).
 *
 * Wires three things and nothing else — this is the foundation api-service builds
 * on, not the CRUD surface:
 *   1. the Better Auth handler at `/api/auth/*` (sign-in, callbacks, session);
 *   2. a public `/health` probe;
 *   3. every router registered in `./routes` (empty for now — the api-service seam).
 *
 * `hono/client` (`hc`) consumes the exported `AppType` for end-to-end types.
 */
import { Hono } from 'hono'
import { auth } from './auth'
import { routers } from './routes'

export const app = new Hono()

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
