import { useNavigate } from '@tanstack/react-router'
import { type CategoryMeta, type Thread } from '@revido/mock-data'
import { Button, CategoryChip, Separator, cn } from '@revido/ui'
import { Archive, Clock, MailOpen, Tag, Zap, X } from 'lucide-react'
import * as React from 'react'

import { ThreadRow } from './thread-row'

type SortMode = 'priority' | 'recent'

interface ThreadListProps {
  title: string
  icon: React.ReactNode
  /** Tint classes for the header icon tile, e.g. "bg-primary/12 text-primary". */
  iconClassName?: string
  threads: Thread[]
  category?: CategoryMeta
  emptyState?: React.ReactNode
  defaultSort?: SortMode
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
  category,
  emptyState,
  defaultSort = 'priority',
}: ThreadListProps) {
  const navigate = useNavigate()
  const [threads, setThreads] = React.useState<Thread[]>(initial)
  const [sort, setSort] = React.useState<SortMode>(defaultSort)
  const [selectMode, setSelectMode] = React.useState(false)
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set())
  const [cursor, setCursor] = React.useState(0)

  const sorted = React.useMemo(() => {
    const copy = [...threads]
    copy.sort((a, b) =>
      sort === 'priority'
        ? b.priorityScore - a.priorityScore
        : b.lastMessageAt.localeCompare(a.lastMessageAt),
    )
    return copy
  }, [threads, sort])

  const rowRefs = React.useRef<Array<HTMLDivElement | null>>([])

  const remove = React.useCallback((id: string) => {
    setThreads((ts) => ts.filter((t) => t.id !== id))
    setSelected((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

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
  const removeRef = React.useRef(remove)
  removeRef.current = remove

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
        case 'e':
        case 'h': {
          const t = list[cursorRef.current]
          if (t) {
            e.preventDefault()
            removeRef.current(t.id)
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
    setThreads((ts) => ts.filter((t) => !selected.has(t.id)))
    setSelected(new Set())
  }, [selected])

  const count = sorted.length

  return (
    <div className="relative h-full">
      <div className="h-full overflow-y-auto">
        {/* Sticky header */}
        <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
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
                  <h1 className="truncate font-display text-lg font-semibold leading-none">
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
          {count === 0 ? (
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
                  onArchive={remove}
                  onSnooze={remove}
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
            <Button variant="ghost" size="sm" onClick={archiveSelected}>
              <Archive className="size-4" /> Archive
            </Button>
            <Button variant="ghost" size="sm">
              <Tag className="size-4" /> Label
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              <MailOpen className="size-4" /> Mark read
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

function SortToggle({ sort, onChange }: { sort: SortMode; onChange: (s: SortMode) => void }) {
  return (
    <div className="flex items-center rounded-xl border border-border bg-card p-0.5">
      <SortButton active={sort === 'priority'} onClick={() => onChange('priority')}>
        <Zap className="size-3.5" /> Priority
      </SortButton>
      <SortButton active={sort === 'recent'} onClick={() => onChange('recent')}>
        <Clock className="size-3.5" /> Recent
      </SortButton>
    </div>
  )
}

function SortButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
        active ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
