// i18n-todo: extract hardcoded copy in this component to the en/nl catalogs (see apps/web/src/i18n)
import { useNavigate } from '@tanstack/react-router'
import type { CategoryMeta, Thread } from '@revido/db'
import {
  Button,
  CategoryChip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Separator,
  cn,
} from '@revido/ui'
import { Archive, Clock, MailOpen, Tag, Zap, X } from 'lucide-react'
import * as React from 'react'

import { ThreadRow } from './thread-row'
import { CATEGORY_LIST } from '@/lib/categories'
import {
  useArchiveThread,
  useArchiveThreads,
  useLabelThreads,
  useMarkThreadsRead,
  useSnoozeThread,
} from '@/lib/hooks'

type SortMode = 'priority' | 'recent'

interface ThreadListProps {
  title: string
  icon: React.ReactNode
  /** Tint classes for the header icon tile, e.g. "bg-primary/12 text-primary". */
  iconClassName?: string
  threads: Thread[]
  /** True while the backing query is loading; renders a skeleton list. */
  loading?: boolean
  category?: CategoryMeta
  emptyState?: React.ReactNode
  defaultSort?: SortMode
}

/** Default snooze target: tomorrow morning. */
function tomorrow9am(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

/** True when focus is in a text field — suppresses single-key shortcuts. */
function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}

export function ThreadList({
  title,
  icon,
  iconClassName,
  threads: initial,
  loading = false,
  category,
  emptyState,
  defaultSort = 'priority',
}: ThreadListProps) {
  const navigate = useNavigate()
  // Real writes go to the API; `removed` optimistically hides a thread until the
  // invalidated query drops it, avoiding a flash where an archived row reappears.
  const [removed, setRemoved] = React.useState<Set<string>>(() => new Set())
  const [sort, setSort] = React.useState<SortMode>(defaultSort)
  const [selectMode, setSelectMode] = React.useState(false)
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set())
  const [cursor, setCursor] = React.useState(0)

  const archiveThread = useArchiveThread()
  const snoozeThread = useSnoozeThread()
  const archiveThreads = useArchiveThreads()
  const labelThreads = useLabelThreads()
  const markThreadsRead = useMarkThreadsRead()

  const sorted = React.useMemo(() => {
    const copy = initial.filter((t) => !removed.has(t.id))
    copy.sort((a, b) =>
      sort === 'priority'
        ? b.priorityScore - a.priorityScore
        : b.lastMessageAt.localeCompare(a.lastMessageAt),
    )
    return copy
  }, [initial, removed, sort])

  const rowRefs = React.useRef<Array<HTMLDivElement | null>>([])

  const hide = React.useCallback((id: string) => {
    setRemoved((prev) => new Set(prev).add(id))
    setSelected((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const archive = React.useCallback(
    (id: string) => {
      hide(id)
      archiveThread.mutate(id)
    },
    [hide, archiveThread],
  )

  const snooze = React.useCallback(
    (id: string) => {
      hide(id)
      snoozeThread.mutate({ id, snoozedUntil: tomorrow9am() })
    },
    [hide, snoozeThread],
  )

  const toggleSelect = React.useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Keep the cursor within bounds as the list shrinks.
  React.useEffect(() => {
    setCursor((c) => Math.max(0, Math.min(c, sorted.length - 1)))
  }, [sorted.length])

  // Scroll the focused row into view.
  React.useEffect(() => {
    rowRefs.current[cursor]?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  // Screen-local keyboard: j/k cursor, Enter opens, e archives, h snoozes.
  const sortedRef = React.useRef(sorted)
  sortedRef.current = sorted
  const cursorRef = React.useRef(cursor)
  cursorRef.current = cursor
  const archiveRef = React.useRef(archive)
  archiveRef.current = archive
  const snoozeRef = React.useRef(snooze)
  snoozeRef.current = snooze

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTyping(e.target)) return
      const list = sortedRef.current
      if (list.length === 0) return
      switch (e.key) {
        case 'j':
          e.preventDefault()
          setCursor((c) => Math.min(c + 1, list.length - 1))
          break
        case 'k':
          e.preventDefault()
          setCursor((c) => Math.max(c - 1, 0))
          break
        case 'Enter': {
          const t = list[cursorRef.current]
          if (t) {
            e.preventDefault()
            void navigate({ to: '/app/thread/$threadId', params: { threadId: t.id } })
          }
          break
        }
        case 'e': {
          const t = list[cursorRef.current]
          if (t) {
            e.preventDefault()
            archiveRef.current(t.id)
          }
          break
        }
        case 'h': {
          const t = list[cursorRef.current]
          if (t) {
            e.preventDefault()
            snoozeRef.current(t.id)
          }
          break
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  const clearSelection = React.useCallback(() => setSelected(new Set()), [])

  const archiveSelected = React.useCallback(() => {
    const ids = [...selected]
    if (ids.length === 0) return
    setRemoved((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.add(id)
      return next
    })
    setSelected(new Set())
    archiveThreads.mutate(ids)
  }, [selected, archiveThreads])

  const markSelectedRead = React.useCallback(() => {
    const ids = [...selected]
    if (ids.length === 0) return
    setSelected(new Set())
    markThreadsRead.mutate(ids)
  }, [selected, markThreadsRead])

  const labelSelected = React.useCallback(
    (label: string) => {
      const ids = [...selected]
      if (ids.length === 0) return
      setSelected(new Set())
      labelThreads.mutate({ threadIds: ids, label })
    },
    [selected, labelThreads],
  )

  const count = sorted.length

  return (
    <div className="relative h-full">
      <div className="h-full overflow-y-auto">
        {/* Sticky header */}
        <header className="glass-thin sticky top-0 z-20 border-x-0 border-t-0">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-3 py-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-4',
                  iconClassName ?? 'bg-primary/12 text-primary',
                )}
              >
                {icon}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-lg font-semibold leading-none">
                    {title}
                  </h1>
                  {category && (
                    <CategoryChip
                      token={category.token}
                      label={category.label}
                      className="hidden shrink-0 sm:inline-flex"
                    />
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {count} {count === 1 ? 'thread' : 'threads'}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <SortToggle sort={sort} onChange={setSort} />
              <Button
                variant={selectMode ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setSelectMode((s) => !s)}
              >
                {selectMode ? 'Done' : 'Select'}
              </Button>
            </div>
          </div>
        </header>

        {/* List */}
        <div className="mx-auto w-full max-w-3xl px-2 pb-24 pt-2 sm:px-3">
          {loading && count === 0 ? (
            <ThreadListSkeleton />
          ) : count === 0 ? (
            <div className="pt-6">
              {emptyState ?? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  Nothing here right now.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {sorted.map((t, i) => (
                <ThreadRow
                  key={t.id}
                  thread={t}
                  focused={i === cursor}
                  selected={selected.has(t.id)}
                  selectMode={selectMode}
                  onToggleSelect={toggleSelect}
                  onArchive={archive}
                  onSnooze={snooze}
                  onHover={() => setCursor(i)}
                  innerRef={(el) => {
                    rowRefs.current[i] = el
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Batch action bar */}
      {selected.size > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-border bg-card px-2.5 py-1.5 shadow-pop">
            <span className="px-1.5 text-sm font-medium tabular-nums">
              {selected.size} selected
            </span>
            <Separator orientation="vertical" className="mx-1 h-5" />
            <Button variant="ghost" size="sm" aria-label="Archive" onClick={archiveSelected}>
              <Archive className="size-4" />
              <span className="hidden sm:inline">Archive</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="Label">
                  <Tag className="size-4" />
                  <span className="hidden sm:inline">Label</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                <DropdownMenuLabel>Move to…</DropdownMenuLabel>
                {CATEGORY_LIST.map((cat) => (
                  <DropdownMenuItem key={cat.id} onSelect={() => labelSelected(cat.label)}>
                    {cat.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="sm" aria-label="Mark read" onClick={markSelectedRead}>
              <MailOpen className="size-4" />
              <span className="hidden sm:inline">Mark read</span>
            </Button>
            <Separator orientation="vertical" className="mx-1 h-5" />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Clear selection"
              onClick={clearSelection}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ThreadListSkeleton() {
  return (
    <div className="flex flex-col gap-0.5 pt-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2.5 sm:px-3">
          <div className="size-5 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3.5 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          </div>
          <div className="hidden h-3 w-12 animate-pulse rounded bg-muted sm:block" />
        </div>
      ))}
    </div>
  )
}

function SortToggle({ sort, onChange }: { sort: SortMode; onChange: (s: SortMode) => void }) {
  return (
    <div className="flex items-center rounded-xl border border-border bg-card p-0.5">
      <SortButton
        active={sort === 'priority'}
        label="Priority"
        onClick={() => onChange('priority')}
      >
        <Zap className="size-3.5" />
        <span className="hidden sm:inline">Priority</span>
      </SortButton>
      <SortButton active={sort === 'recent'} label="Recent" onClick={() => onChange('recent')}>
        <Clock className="size-3.5" />
        <span className="hidden sm:inline">Recent</span>
      </SortButton>
    </div>
  )
}

function SortButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
        active ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
