import { Outlet } from '@tanstack/react-router'
import { useGlobalKeyboard } from '@/lib/use-global-keyboard'
import { AIPanel } from './ai-panel'
import { CommandPalette } from './command-palette'
import { NavRail } from './nav-rail'

/**
 * The 3-zone app shell: nav rail · center stage · AI panel. Center stage is an
 * <Outlet/>; each screen owns its own scroll region. Mounts the global keyboard
 * map and the ⌘K command palette.
 */
export function AppShell() {
  useGlobalKeyboard()
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <NavRail />
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
      <AIPanel />
      <CommandPalette />
    </div>
  )
}
