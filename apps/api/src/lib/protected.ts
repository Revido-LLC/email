/**
 * `protectedRouter()` — the per-resource Hono sub-app factory.
 *
 * Every user-scoped router in `../routes` is built from this: it mounts
 * {@link requireUser} (so `c.get('userId')` is always present downstream) and the
 * shared {@link errorHandler}. `routes/index.ts` registers each returned app in the
 * `routers[]` seam that `app.ts` mounts.
 */
import { Hono } from 'hono'
import { requireUser, type Variables } from '../middleware/auth'
import { errorHandler } from './http'

/** A Hono app whose handlers can read `c.get('userId')`. */
export type ProtectedApp = Hono<{ Variables: Variables }>

/** Create a `requireUser`-gated sub-app with the shared error handler. */
export function protectedRouter(): ProtectedApp {
  const app = new Hono<{ Variables: Variables }>()
  app.onError(errorHandler)
  app.use('*', requireUser)
  return app
}
