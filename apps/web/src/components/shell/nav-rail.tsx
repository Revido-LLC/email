import { Link } from '@tanstack/react-router'
import {
  CATEGORY_LIST,
  ACCOUNTS,
  getCategoryCounts,
  getNeedsYou,
  getPendingApprovalCount,
  USER,
} from '@revido/mock-data'
import {
  Button,
  ContactAvatar,
  Kbd,
  Progress,
  ScrollArea,
  SimpleTooltip,
  cn,
} from '@revido/ui'
import { Icon } from '@/lib/icons'
import {
  Bell,
  CheckCircle2,
  ChevronsLeft,
  Home,
  Inbox,
  PanelLeft,
  Pencil,
  Settings,
  Sparkles,
  X,
} from 'lucide-react'
import * as React from 'react'
import { useAppState } from '@/lib/app-state'

const counts = getCategoryCounts()
const needsYouCount = getNeedsYou().length
const approvals = getPendingApprovalCount()

function NavLink({
  to,
  icon,
  label,
  count,
  badge,
  collapsed,
  exact,
}: {
  to: string
  icon: React.ReactNode
  label: string
  count?: number
  badge?: number
  collapsed: boolean
  exact?: boolean
}) {
  const inner = (
    <Link
      to={to}
      activeOptions={{ exact }}
      activeProps={{ 'data-active': 'true' }}
      className={cn(
        'group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors',
        'hover:bg-muted hover:text-foreground',
        'data-[active=true]:bg-primary/12 data-[active=true]:text-primary',
        collapsed && 'justify-center px-0',
      )}
    >
      <span className="relative flex size-5 shrink-0 items-center justify-center [&_svg]:size-4">
        {icon}
        {badge ? (
          <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-2xs font-semibold text-primary-foreground">
            {badge}
          </span>
        ) : null}
      </span>
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {count ? <span className="text-xs text-muted-foreground">{count}</span> : null}
        </>
      )}
    </Link>
  )
  return collapsed ? (
    <SimpleTooltip label={label} side="right">
      {inner}
    </SimpleTooltip>
  ) : (
    inner
  )
}

function CategoryNavItem({
  cat,
  collapsed,
}: {
  cat: (typeof CATEGORY_LIST)[number]
  collapsed: boolean
}) {
  const link = (
    <Link
      to="/app/category/$categoryId"
      params={{ categoryId: cat.id }}
      activeProps={{ 'data-active': 'true' }}
      className={cn(
        'group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors',
        'hover:bg-muted hover:text-foreground',
        'data-[active=true]:bg-primary/12 data-[active=true]:text-primary',
        collapsed && 'justify-center px-0',
      )}
    >
      <span className="flex size-5 shrink-0 items-center justify-center [&_svg]:size-4">
        <Icon name={cat.icon} />
      </span>
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 truncate">{cat.label}</span>
          <span className="text-xs tabular-nums text-muted-foreground">{counts[cat.id] ?? 0}</span>
        </>
      )}
    </Link>
  )
  return collapsed ? (
    <SimpleTooltip label={`${cat.label} · ${counts[cat.id] ?? 0}`} side="right">
      {link}
    </SimpleTooltip>
  ) : (
    link
  )
}

export function NavRail() {
  const { navCollapsed, toggleNav } = useAppState()
  const [revidoDismissed, setRevidoDismissed] = React.useState(false)
  const account = ACCOUNTS[0]!

  return (
    <nav
      className={cn(
        'hidden h-full shrink-0 flex-col glass-thin border-y-0 border-l-0 transition-[width] duration-200 lg:flex',
        navCollapsed ? 'w-[68px]' : 'w-60',
      )}
    >
      {/* Account + compose */}
      <div className={cn('flex items-center gap-2 p-3', navCollapsed && 'flex-col')}>
        <Link
          to="/app/settings"
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 rounded-xl p-1.5 hover:bg-muted',
            navCollapsed && 'flex-none',
          )}
        >
          <ContactAvatar name={USER.name} className="size-8" />
          {!navCollapsed && (
            <div className="min-w-0 flex-1 text-left">
              <div className="truncate text-sm font-semibold">{USER.name}</div>
              <div className="truncate text-xs text-muted-foreground">{account.email}</div>
            </div>
          )}
        </Link>
        {!navCollapsed && (
          <SimpleTooltip label="Collapse (⌘\)" side="bottom">
            <Button variant="ghost" size="icon-sm" onClick={toggleNav} aria-label="Collapse nav">
              <ChevronsLeft className="size-4" />
            </Button>
          </SimpleTooltip>
        )}
      </div>

      <div className="px-3">
        <Button asChild className="w-full justify-center gap-2">
          <Link to="/app/compose">
            <Pencil className="size-4" />
            {!navCollapsed && <span>Compose</span>}
            {!navCollapsed && (
              <Kbd className="ml-auto bg-primary-foreground/20 text-primary-foreground">c</Kbd>
            )}
          </Link>
        </Button>
      </div>

      <ScrollArea className="mt-3 min-h-0 flex-1">
        <div className="flex flex-col gap-0.5 px-3">
          <NavLink to="/app" exact icon={<Home />} label="Today" collapsed={navCollapsed} />
          <NavLink
            to="/app/inbox"
            icon={<Inbox />}
            label="Needs You"
            count={needsYouCount}
            collapsed={navCollapsed}
          />
          <NavLink
            to="/app/approvals"
            icon={<CheckCircle2 />}
            label="Approvals"
            badge={approvals}
            collapsed={navCollapsed}
          />
        </div>

        {!navCollapsed ? (
          <div className="mt-5 px-4 text-2xs font-semibold uppercase tracking-wide text-muted-foreground/70">
            Categories
          </div>
        ) : (
          <div className="mx-auto mt-3 mb-1 h-px w-7 bg-border" aria-hidden />
        )}
        <div className="mt-1.5 flex flex-col gap-0.5 px-3">
          {CATEGORY_LIST.map((cat) => (
            <CategoryNavItem key={cat.id} cat={cat} collapsed={navCollapsed} />
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-0.5 px-3">
          <NavLink to="/app/reminders" icon={<Bell />} label="Reminders" collapsed={navCollapsed} />
          <NavLink to="/app/agents" icon={<Sparkles />} label="Agents" collapsed={navCollapsed} />
        </div>
      </ScrollArea>

      {/* Footer: sync, settings, Revido card. */}
      <div className="border-t border-border p-3">
        {!navCollapsed && (
          <div className="mb-3 rounded-xl bg-muted/60 p-2.5">
            <div className="flex items-center justify-between text-2xs text-muted-foreground">
              <span>{account.syncLabel}</span>
            </div>
            <Progress value={account.syncProgress} className="mt-1.5 h-1" />
          </div>
        )}

        <div className={cn('flex items-center gap-1', navCollapsed && 'flex-col')}>
          <NavLink
            to="/app/settings"
            icon={<Settings />}
            label="Settings"
            collapsed={navCollapsed}
          />
          {navCollapsed && (
            <SimpleTooltip label="Expand nav" side="right">
              <Button variant="ghost" size="icon-sm" onClick={toggleNav} aria-label="Expand nav">
                <PanelLeft className="size-4" />
              </Button>
            </SimpleTooltip>
          )}
        </div>

        {!navCollapsed && !revidoDismissed && (
          <div className="relative mt-3 overflow-hidden rounded-xl bg-muted/50 p-3">
            <button
              onClick={() => setRevidoDismissed(true)}
              className="absolute right-2 top-2 rounded-md p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="size-3.5" />
            </button>
            <div className="text-xs font-semibold">Built by Revido</div>
            <p className="mt-1 text-2xs text-muted-foreground">
              We build custom AI tools for companies.
            </p>
            <Link
              to="/talk"
              className="mt-2 inline-block text-2xs font-semibold text-primary hover:underline"
            >
              Talk to us →
            </Link>
          </div>
        )}
      </div>
    </nav>
  )
}
