/**
 * Bridges the auth session to analytics identity. Renders nothing.
 *
 * When a user becomes authenticated we `identify` them by **id only** (never
 * email/name); when they sign out we `reset` so later events aren't attributed to
 * the previous user. A no-op whenever analytics is uninitialized (no PostHog key).
 */
import * as React from 'react'
import { identifyUser, resetAnalytics } from './analytics'
import { useAuth } from './session'

export function AnalyticsBridge(): null {
  const { user, isAuthenticated } = useAuth()
  const userId = user?.id ?? null
  const identifiedRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (isAuthenticated && userId) {
      if (identifiedRef.current !== userId) {
        identifiedRef.current = userId
        identifyUser(userId)
      }
      return
    }
    // Signed out (or never signed in): reset once after having been identified.
    if (identifiedRef.current !== null) {
      identifiedRef.current = null
      resetAnalytics()
    }
  }, [isAuthenticated, userId])

  return null
}
