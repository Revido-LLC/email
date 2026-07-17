import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { TooltipProvider } from '@revido/ui'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import i18n from './i18n/config'
import { initAnalytics } from './lib/analytics'
import { AnalyticsBridge } from './lib/analytics-bridge'
import { AppStateProvider } from './lib/app-state'
import { AppearanceSync } from './lib/appearance-sync'
import { SessionProvider } from './lib/session'
import { routeTree } from './routeTree.gen'
import './styles.css'

// Content-free product analytics. A complete no-op unless VITE_POSTHOG_KEY is set.
initAnalytics()

// Real-data defaults: keep data fresh but avoid refetch storms. Screens read
// from mock data today; a later wave swaps them onto the React Query hook layer
// (`@/lib/hooks`), at which point these defaults govern every read.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootEl = document.getElementById('root')!
createRoot(rootEl).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <AppStateProvider>
            <TooltipProvider delayDuration={300}>
              <AnalyticsBridge />
              <AppearanceSync />
              <RouterProvider router={router} />
            </TooltipProvider>
          </AppStateProvider>
        </SessionProvider>
      </QueryClientProvider>
    </I18nextProvider>
  </StrictMode>,
)
