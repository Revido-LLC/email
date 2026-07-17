import { createFileRoute, redirect } from '@tanstack/react-router'
import { AppShell } from '@/components/shell/app-shell'
import { authClient } from '@/lib/auth-client'

/** The `/app/*` layout: renders the 3-zone shell; children fill the center stage. */
export const Route = createFileRoute('/app')({
  // The app's first auth guard: resolve the Better Auth session before the
  // `/app/*` subtree loads, and bounce unauthenticated visitors to the landing
  // page. Fails closed — a rejected or failed session check redirects too.
  beforeLoad: async () => {
    let authenticated = false
    try {
      const { data } = await authClient.getSession()
      authenticated = Boolean(data)
    } catch {
      authenticated = false
    }
    if (!authenticated) {
      throw redirect({ to: '/' })
    }
  },
  component: AppShell,
})
