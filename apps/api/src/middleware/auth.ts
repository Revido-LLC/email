/**
 * `requireUser` — the Hono auth gate.
 *
 * Resolves the Better Auth session from the request headers; 401s when there is
 * none, otherwise stashes the user id on the context as `userId`. Downstream
 * routers read it (`c.get('userId')`) and pass it to `withUser()` for RLS-scoped
 * queries. Mount it per-router (not globally) so the Better Auth handler and
 * `/health` stay public.
 */
import { createMiddleware } from 'hono/factory'
import { auth } from '../auth'

/** Context variables set by `requireUser` and read by protected routers. */
export interface Variables {
  userId: string
}

export const requireUser = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  c.set('userId', session.user.id)
  await next()
})
