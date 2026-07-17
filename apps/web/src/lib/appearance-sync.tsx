/**
 * Syncs the theme preference between local state and the server. Renders nothing.
 *
 * `themePreference` in `app-state` is the instant, offline-friendly source of
 * truth (backed by localStorage); this bridge makes it *follow the user across
 * devices* by mirroring it to `users.theme` via `/settings/appearance`.
 *
 * Precedence, once the user is authenticated:
 *  - **Hydrate (server wins):** on the first successful fetch, if the server has a
 *    stored theme, apply it. If it doesn't, seed the server from the local cache so
 *    the preference starts following. Either way, localStorage stays the offline
 *    cache (written by `app-state` whenever `themePreference` changes).
 *  - **Persist:** any later change to `themePreference` — from *any* surface
 *    (Settings, onboarding, the nav-rail toggle, the ⌘K palette, the keyboard
 *    shortcut) — is PATCHed up. Centralizing here means every surface is covered
 *    without wiring each one.
 *
 * Anonymous visitors never touch the server (the endpoint is auth-gated): their
 * theme changes remain localStorage-only until they sign in and hydration seeds
 * the server.
 */
import * as React from 'react'
import { useAppState, type ThemePreference } from './app-state'
import { useAppearance, useUpdateAppearance } from './hooks/settings'
import { useAuth } from './session'

export function AppearanceSync(): null {
  const { isAuthenticated } = useAuth()
  const { themePreference, setThemePreference } = useAppState()
  const { data } = useAppearance(isAuthenticated)
  const { mutate } = useUpdateAppearance()

  const hydratedRef = React.useRef(false)
  const lastSyncedRef = React.useRef<ThemePreference | null>(null)

  // Hydrate once from the server (server wins; otherwise seed it from local).
  React.useEffect(() => {
    if (!isAuthenticated || hydratedRef.current || data === undefined) return
    hydratedRef.current = true
    const serverTheme = data.theme
    if (serverTheme) {
      lastSyncedRef.current = serverTheme
      if (serverTheme !== themePreference) setThemePreference(serverTheme)
    } else {
      lastSyncedRef.current = themePreference
      mutate(themePreference)
    }
  }, [isAuthenticated, data, themePreference, setThemePreference, mutate])

  // Persist later changes from any surface, once hydrated and authenticated.
  React.useEffect(() => {
    if (!isAuthenticated || !hydratedRef.current) return
    if (lastSyncedRef.current === themePreference) return
    lastSyncedRef.current = themePreference
    mutate(themePreference)
  }, [isAuthenticated, themePreference, mutate])

  return null
}
