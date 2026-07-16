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
import { useTranslation } from 'react-i18next'
import { useAppState } from '@/lib/app-state'

const itemCls =
  'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-foreground outline-none data-[selected=true]:bg-muted [&_svg]:size-4 [&_svg]:text-muted-foreground'
const groupCls =
  '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground/70'

export function CommandPalette() {
  const { t } = useTranslation()
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
        className="top-24 max-w-xl translate-y-0 gap-0 overflow-hidden p-0 glass"
      >
        <DialogTitle className="sr-only">{t('shell.commandPalette.title')}</DialogTitle>
        <Command
          className="flex flex-col"
          filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
        >
          <div className="flex items-center gap-2.5 border-b border-border px-4">
            <Search className="size-4 text-muted-foreground" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder={t('shell.commandPalette.placeholder')}
              className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            />
            <Kbd>esc</Kbd>
          </div>

          <Command.List className="max-h-80 overflow-y-auto overflow-x-hidden p-2">
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
              {t('shell.commandPalette.noResults')}
            </Command.Empty>

            {query.trim() && (
              <Command.Group className={groupCls}>
                <Command.Item
                  value={`ask ai ${query}`}
                  onSelect={askAi}
                  className={cn(itemCls, 'text-ai')}
                >
                  <Sparkles className="text-ai" />
                  <span>{t('shell.commandPalette.askAi', { query })}</span>
                </Command.Item>
              </Command.Group>
            )}

            <Command.Group heading={t('shell.commandPalette.groupJumpTo')} className={groupCls}>
              <Command.Item
                value="today home brief"
                onSelect={() => go('/app')}
                className={itemCls}
              >
                <Home /> {t('shell.commandPalette.jumpToday')}
              </Command.Item>
              <Command.Item
                value="inbox needs you"
                onSelect={() => go('/app/inbox')}
                className={itemCls}
              >
                <Inbox /> {t('shell.commandPalette.jumpInbox')}
              </Command.Item>
              <Command.Item
                value="approvals"
                onSelect={() => go('/app/approvals')}
                className={itemCls}
              >
                <CheckCircle2 /> {t('shell.commandPalette.jumpApprovals')}
              </Command.Item>
              <Command.Item
                value="agents automations"
                onSelect={() => go('/app/agents')}
                className={itemCls}
              >
                <Sparkles /> {t('shell.commandPalette.jumpAgents')}
              </Command.Item>
              <Command.Item
                value="reminders follow ups"
                onSelect={() => go('/app/reminders')}
                className={itemCls}
              >
                <Bell /> {t('shell.commandPalette.jumpReminders')}
              </Command.Item>
              <Command.Item
                value="settings preferences"
                onSelect={() => go('/app/settings')}
                className={itemCls}
              >
                <Settings /> {t('shell.commandPalette.jumpSettings')}
              </Command.Item>
            </Command.Group>

            <Command.Group heading={t('shell.commandPalette.groupCategories')} className={groupCls}>
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

            <Command.Group heading={t('shell.commandPalette.groupThreads')} className={groupCls}>
              {THREADS.slice(0, 12).map((thread) => (
                <Command.Item
                  key={thread.id}
                  value={`${thread.subject} ${thread.participants.map((p) => p.name).join(' ')}`}
                  onSelect={() => go('/app/thread/$threadId', { threadId: thread.id })}
                  className={itemCls}
                >
                  <Sparkle />
                  <span className="min-w-0 flex-1 truncate">{thread.subject}</span>
                  <span className="shrink-0 text-2xs text-muted-foreground">
                    {thread.participants[0]?.name}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading={t('shell.commandPalette.groupActions')} className={groupCls}>
              <Command.Item
                value="compose new email write"
                onSelect={() => go('/app/compose')}
                className={itemCls}
              >
                <Pencil /> {t('shell.commandPalette.actionCompose')}
              </Command.Item>
              <Command.Item
                value="create agent automation"
                onSelect={() => go('/app/agents')}
                className={itemCls}
              >
                <Sparkles /> {t('shell.commandPalette.actionCreateAgent')}
              </Command.Item>
              <Command.Item
                value="toggle theme dark light mode"
                onSelect={() => {
                  toggleTheme()
                  setCommandOpen(false)
                }}
                className={itemCls}
              >
                <Moon /> {t('shell.commandPalette.actionToggleTheme')}
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
