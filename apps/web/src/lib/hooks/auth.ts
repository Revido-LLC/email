/**
 * React Query hook for kicking off a provider OAuth link.
 *
 * `POST /auth/oauth/:provider/start` returns the URL to send the browser to. The
 * matching callback is a server-side redirect (into `/onboarding`), so it has no
 * client hook. Interactive session sign-in/out lives in `@/lib/auth-client`
 * (Better Auth); this covers the "connect another mailbox" flow.
 */
import { useMutation } from '@tanstack/react-query'
import type { Provider } from '@revido/db'
import { api } from '@/lib/api'

/** `POST /auth/oauth/:provider/start` */
export function useStartOAuth() {
  return useMutation({
    mutationFn: (provider: Provider) =>
      api.post<{ redirectUrl: string }>(`/auth/oauth/${provider}/start`),
  })
}
