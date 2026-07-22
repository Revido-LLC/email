import { Link, Outlet } from '@tanstack/react-router'
import { isDemo } from '@/lib/demo'
import { useGlobalKeyboard } from '@/lib/use-global-keyboard'
import { AIPanel } from './ai-panel'
import { BottomBar } from './bottom-bar'
import { CommandPalette } from './command-palette'
import { NavRail } from './nav-rail'

/** A slim banner making it unmistakable this is sample data, with a sign-in CTA. */
function DemoBanner() {
  return (
    <div className="flex shrink-0 items-center justify-center gap-2 bg-ai/10 px-4 py-1.5 text-center text-2xs text-foreground sm:text-xs">
      <span className="font-medium">Demo</span>
      <span className="text-muted-foreground">
        You’re exploring sample data — nothing here is a real mailbox.
      </span>
      <Link to="/" className="font-medium text-ai underline-offset-2 hover:underline">
        Sign in to use your inbox
      </Link>
    </div>
  )
}

/**
 * The app shell. On desktop (`lg+`) it's a 3-zone row: nav rail · center stage ·
 * AI panel. Below `lg` it stacks to a column — the nav rail and AI column hide,
 * a bottom tab bar takes over, and the assistant becomes a slide-over. Center
 * stage is an <Outlet/>; each screen owns its own scroll region.
 */
export function AppShell() {
  useGlobalKeyboard()
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      {isDemo() && <DemoBanner />}
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:flex-row">
        <NavRail />
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </main>
        <AIPanel />
        <BottomBar />
        <CommandPalette />
      </div>
    </div>
  )
}
