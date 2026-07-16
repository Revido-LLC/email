// i18n-todo: extract hardcoded copy in this component to the en/nl catalogs (see apps/web/src/i18n);
// mirror the equivalent labels already wired in shell/nav-rail.tsx (shell.nav.*)
import { Link } from '@tanstack/react-router'
import { cn } from '@revido/ui'
import { Home, Inbox, Pencil, Settings, Sparkles } from 'lucide-react'
import * as React from 'react'
import { useAppState } from '@/lib/app-state'

/**
 * Mobile bottom tab bar (shown below `lg`, hidden on desktop where the nav rail
 * takes over). A flex-column sibling of <main>, so it sits under the content
 * without overlapping it. Uses the frosted `glass` material.
 */
function BottomItem({
  to,
  exact,
  icon,
  label,
}: {
  to: string
  exact?: boolean
  icon: React.ReactNode
  label: string
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact }}
      activeProps={{ 'data-active': 'true' }}
      className="flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1 text-muted-foreground transition-colors data-[active=true]:text-primary [&_svg]:size-5"
    >
      {icon}
      <span className="text-2xs font-medium">{label}</span>
    </Link>
  )
}

export function BottomBar() {
  const { setMobileAiOpen } = useAppState()
  return (
    <nav
      className="glass flex shrink-0 items-center gap-1 px-2 py-1.5 lg:hidden"
      aria-label="Primary"
    >
      <BottomItem to="/app" exact icon={<Home />} label="Today" />
      <BottomItem to="/app/inbox" icon={<Inbox />} label="Inbox" />
      {/* Compose — the one loud action, promoted to a filled ink button. */}
      <Link
        to="/app/compose"
        aria-label="Compose"
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-full',
          'bg-primary text-primary-foreground shadow-soft active:scale-95 [&_svg]:size-5',
        )}
      >
        <Pencil />
      </Link>
      <button
        type="button"
        onClick={() => setMobileAiOpen(true)}
        className="flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1 text-muted-foreground [&_svg]:size-5"
      >
        <Sparkles className="text-ai" />
        <span className="text-2xs font-medium">Assistant</span>
      </button>
      <BottomItem to="/app/settings" icon={<Settings />} label="Settings" />
    </nav>
  )
}
