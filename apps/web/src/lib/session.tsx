/**
 * Session provider — the app-facing view of the authenticated user.
 *
 * Mirrors `app-state.tsx`: a context around Better Auth's `useSession` so screens
 * read `user`/`session` without each re-subscribing to the auth store. The router
 * guard in `routes/app.tsx` is what actually blocks unauthenticated access; this
 * provider just exposes who is signed in (and a `signOut` helper).
 */
import * as React from 'react'
import { authClient } from './auth-client'

type SessionResult = ReturnType<typeof authClient.useSession>
export type Session = SessionResult['data']
export type SessionUser = NonNullable<Session>['user']

interface SessionContextValue {
  session: Session
  user: SessionUser | null
  /** True while the first session fetch is in flight. */
  isPending: boolean
  isAuthenticated: boolean
  signOut: () => Promise<void>
}

const SessionContext = React.createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { data, isPending } = authClient.useSession()

  const value = React.useMemo<SessionContextValue>(
    () => ({
      session: data,
      user: data?.user ?? null,
      isPending,
      isAuthenticated: Boolean(data),
      signOut: () => authClient.signOut().then(() => undefined),
    }),
    [data, isPending],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

/** Access the current session/user. Throws outside `SessionProvider`. */
export function useAuth(): SessionContextValue {
  const ctx = React.useContext(SessionContext)
  if (!ctx) throw new Error('useAuth must be used within SessionProvider')
  return ctx
}
