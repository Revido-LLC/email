import { createFileRoute, redirect } from '@tanstack/react-router'
import { AppShell } from '@/components/shell/app-shell'
import { authClient } from '@/lib/auth-client'
import { enableDemo, isDemo } from '@/lib/demo'

/** The `/app/*` layout: renders the 3-zone shell; children fill the center stage. */
export const Route = createFileRoute('/app')({
  // `?demo` (from "See it live") opens the synthetic seed inbox — no auth, no
  // real mailbox. It's sticky for the session so in-app navigation stays in the
  // demo without threading the flag through every link.
  validateSearch: (search: Record<string, unknown>): { demo?: boolean } =>
    search.demo != null && search.demo !== false && search.demo !== 'false'
      ? { demo: true }
      : {},
  // The app's first auth guard: resolve the Better Auth session before the
  // `/app/*` subtree loads, and bounce unauthenticated visitors to the landing
  // page. Fails closed — a rejected or failed session check redirects too. Demo
  // mode skips the guard entirely (it never touches a real session or mailbox).
  beforeLoad: async ({ search }) => {
    if (search.demo || isDemo()) {
      enableDemo()
      return
    }
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
