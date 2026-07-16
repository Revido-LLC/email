/**
 * @revido/api — the Hono API service entrypoint (Railway).
 *
 * Boots `@hono/node-server` on `$PORT`. The app itself (Better Auth handler,
 * health probe, the router seam) lives in `./app`; api-service extends it by
 * registering routers in `./routes`.
 */
import { serve } from '@hono/node-server'
import { app, type AppType } from './app'

export { app }
export type { AppType }

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT ?? 8787)
  serve({ fetch: app.fetch, port })
  console.log(`[api] listening on :${port}`)
}
