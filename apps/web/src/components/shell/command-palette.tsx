import { useNavigate } from '@tanstack/react-router'
import { CATEGORY_LIST, THREADS } from '@revido/mock-data'
import { CategoryDot, Dialog, DialogContent, DialogTitle, Kbd, Sparkle, cn } from '@revido/ui'
import { Command } from 'cmdk'
import {
  Bell,
  CheckCircle2,
  Home,
  Inbox,
  Moon,
  Pencil,
  Search,
  Settings,
  Sparkles,
} from 'lucide-react'
import * as React from 'react'
import { useAppState } from '@/lib/app-state'

const itemCls =
  'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground outline-none data-[selected=true]:bg-muted [&_svg]:size-4 [&_svg]:text-muted-foreground'
const groupCls =
  '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground/70'

export function CommandPalette() {
  const { commandOpen, setCommandOpen, setAiPanelOpen, setAiTab, toggleTheme } = useAppState()
  const navigate = useNavigate()
  const [query, setQuery] = React.useState('')

  const go = React.useCallback(
    (to: string, params?: Record<string, string>) => {
      setCommandOpen(false)
      setQuery('')
      void navigate({ to, params } as never)
    },
    [navigate, setCommandOpen],
  )

  const askAi = React.useCallback(() => {
    setCommandOpen(false)
    setQuery('')
    setAiPanelOpen(true)
    setAiTab('chat')
  }, [setAiPanelOpen, setAiTab, setCommandOpen])

  return (
    <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
      <DialogContent
        showClose={false}
        className="top-24 max-w-xl translate-y-0 gap-0 overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command
          className="flex flex-col"
          filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
        >
          <div className="flex items-center gap-2.5 border-b border-border px-4">
            <Search className="size-4 text-muted-foreground" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search or type a command…"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            />
            <Kbd>esc</Kbd>
          </div>

          <Command.List className="max-h-80 overflow-y-auto overflow-x-hidden p-2">
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>

            {query.trim() && (
              <Command.Group className={groupCls}>
                <Command.Item
                  value={`ask ai ${query}`}
                  onSelect={askAi}
                  className={cn(itemCls, 'text-ai')}
                >
                  <Sparkles className="text-ai" />
                  <span>
                    Ask AI: <span className="font-medium">“{query}”</span>
                  </span>
                </Command.Item>
              </Command.Group>
            )}

            <Command.Group heading="Jump to" className={groupCls}>
              <Command.Item
                value="today home brief"
                onSelect={() => go('/app')}
                className={itemCls}
              >
                <Home /> Today
              </Command.Item>
              <Command.Item
                value="inbox needs you"
                onSelect={() => go('/app/inbox')}
                className={itemCls}
              >
                <Inbox /> Inbox — Needs You
              </Command.Item>
              <Command.Item
                value="approvals"
                onSelect={() => go('/app/approvals')}
                className={itemCls}
              >
                <CheckCircle2 /> Approvals
              </Command.Item>
              <Command.Item
                value="agents automations"
                onSelect={() => go('/app/agents')}
                className={itemCls}
              >
                <Sparkles /> Agents
              </Command.Item>
              <Command.Item
                value="reminders follow ups"
                onSelect={() => go('/app/reminders')}
                className={itemCls}
              >
                <Bell /> Reminders
              </Command.Item>
              <Command.Item
                value="settings preferences"
                onSelect={() => go('/app/settings')}
                className={itemCls}
              >
                <Settings /> Settings
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Categories" className={groupCls}>
              {CATEGORY_LIST.map((cat) => (
                <Command.Item
                  key={cat.id}
                  value={['category', cat.label, ...(cat.keywords ?? [])].join(' ')}
                  onSelect={() => go('/app/category/$categoryId', { categoryId: cat.id })}
                  className={itemCls}
                >
                  <span className="flex size-4 items-center justify-center">
                    <CategoryDot token={cat.token} />
                  </span>
                  {cat.label}
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="Threads" className={groupCls}>
              {THREADS.slice(0, 12).map((t) => (
                <Command.Item
                  key={t.id}
                  value={`${t.subject} ${t.participants.map((p) => p.name).join(' ')}`}
                  onSelect={() => go('/app/thread/$threadId', { threadId: t.id })}
                  className={itemCls}
                >
                  <Sparkle />
                  <span className="min-w-0 flex-1 truncate">{t.subject}</span>
                  <span className="shrink-0 text-2xs text-muted-foreground">
                    {t.participants[0]?.name}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="Actions" className={groupCls}>
              <Command.Item
                value="compose new email write"
                onSelect={() => go('/app/compose')}
                className={itemCls}
              >
                <Pencil /> Compose new email
              </Command.Item>
              <Command.Item
                value="create agent automation"
                onSelect={() => go('/app/agents')}
                className={itemCls}
              >
                <Sparkles /> Create an agent
              </Command.Item>
              <Command.Item
                value="toggle theme dark light mode"
                onSelect={() => {
                  toggleTheme()
                  setCommandOpen(false)
                }}
                className={itemCls}
              >
                <Moon /> Toggle theme
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
