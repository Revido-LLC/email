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

declare const RevidoFeedback: {
  init(config: { token: string; apiUrl: string }): void
}

RevidoFeedback.init({
  token: 'fb_proj_2829d4482d68a3723046269f3b60277c',
  apiUrl: 'https://feedback-api-production-5148.up.railway.app',
})

// The widget intentionally docks at mid-screen on mobile. Keep it reachable but
// move it away from page copy and app controls.
requestAnimationFrame(() => {
  const host = document.getElementById('revido-feedback-widget')
  const root = host?.shadowRoot
  if (!root) return
  const style = document.createElement('style')
  style.textContent = `
    @media (max-width: 640px) {
      .rf-trigger {
        top: auto !important;
        right: 12px !important;
        bottom: 12px !important;
        left: auto !important;
        transform: none !important;
        border-radius: 9999px !important;
      }
      .rf-trigger:hover { transform: scale(1.05) !important; }
      .rf-trigger:active { transform: scale(.97) !important; }
    }
  `
  root.appendChild(style)
})

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
