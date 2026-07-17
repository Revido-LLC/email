/**
 * Better Auth React client.
 *
 * Talks to the API's Better Auth handler (mounted at `/api/auth/*`). `baseURL`
 * defaults to the same origin; set `VITE_API_URL` when the API is deployed on a
 * separate host. Better Auth manages its own credentialed fetch, so the session
 * cookie rides along automatically — no extra config needed.
 */
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? '',
})

/**
 * Low-level Better Auth hooks/actions. Application code should prefer the
 * `useAuth` accessor from `@/lib/session` (which wraps `useSession` in context);
 * these are re-exported for `signIn`/`signOut` calls and for the router guard's
 * `authClient.getSession()`.
 */
export const { useSession, signIn, signOut } = authClient
