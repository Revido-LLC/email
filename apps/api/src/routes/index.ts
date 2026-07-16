/**
 * The router registry — the seam api-service fills.
 *
 * `app.ts` mounts each entry with `app.route(path, router)`. auth-persistence
 * ships this empty; api-service appends its CRUD/OAuth/webhook routers here (each
 * a `Hono` sub-app protected by `requireUser` where appropriate), keeping
 * `app.ts` untouched.
 */
import type { Hono } from 'hono'

export interface RouterEntry {
  path: string
  router: Hono
}

export const routers: RouterEntry[] = []
