/**
 * @revido/api — the Hono API service (W1/W3/W4).
 *
 * The contract-doc endpoints (reads + the ~41 mutations), OAuth start/callback,
 * provider push webhooks, and the AI/agent/lead endpoints. Runs under
 * `infisical run` on Railway. `hono/client` (`hc`) gives the frontend
 * end-to-end types via the exported `AppType`.
 *
 * This Wave 0 stub is a health-check app the Wave 2 `api-service` agent builds on.
 */

import { serve } from '@hono/node-server'
import { Hono } from 'hono'

export const app = new Hono().get('/health', (c) => c.json({ ok: true, service: 'api' }))

/** The router type consumed by the frontend `hc` client. */
export type AppType = typeof app

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT ?? 8787)
  serve({ fetch: app.fetch, port })
  // eslint-disable-next-line no-console
  console.log(`[api] listening on :${port}`)
}
