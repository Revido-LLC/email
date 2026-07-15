import { Outlet } from '@tanstack/react-router'
import { useGlobalKeyboard } from '@/lib/use-global-keyboard'
import { AIPanel } from './ai-panel'
import { BottomBar } from './bottom-bar'
import { CommandPalette } from './command-palette'
import { NavRail } from './nav-rail'

/**
 * The app shell. On desktop (`lg+`) it's a 3-zone row: nav rail · center stage ·
 * AI panel. Below `lg` it stacks to a column — the nav rail and AI column hide,
 * a bottom tab bar takes over, and the assistant becomes a slide-over. Center
 * stage is an <Outlet/>; each screen owns its own scroll region.
 */
export function AppShell() {
  useGlobalKeyboard()
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground lg:flex-row">
      <NavRail />
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
      <AIPanel />
      <BottomBar />
      <CommandPalette />
    </div>
  )
}
