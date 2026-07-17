// i18n-todo: extract hardcoded copy in this component to the en/nl catalogs (see apps/web/src/i18n)
import type { Thread } from '@revido/db'
import {
  Button,
  CategoryChip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SimpleTooltip,
} from '@revido/ui'
import {
  AlarmClock,
  Archive,
  ArrowLeft,
  BellOff,
  Clock,
  Mail,
  MoreHorizontal,
  Star,
  Tag,
  Trash2,
} from 'lucide-react'
import { CATEGORIES, CATEGORY_LIST } from '@/lib/categories'
import {
  useDeleteThread,
  useMarkThreadUnread,
  useMoveThread,
  useMuteThread,
  useSnoozeThread,
  useToggleThreadStar,
} from '@/lib/hooks'

interface Props {
  thread: Thread
  onBack: () => void
  onArchive: () => void
}

/** Default snooze target: tomorrow morning. */
function tomorrow9am(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

export function ThreadTopBar({ thread, onBack, onArchive }: Props) {
  const meta = CATEGORIES[thread.category]
  const snooze = useSnoozeThread()
  const toggleStar = useToggleThreadStar()
  const markUnread = useMarkThreadUnread()
  const move = useMoveThread()
  const mute = useMuteThread()
  const deleteThread = useDeleteThread()

  return (
    <header className="glass-thin flex shrink-0 items-center gap-2 border-x-0 border-t-0 px-3 py-2.5">
      <SimpleTooltip label="Back · esc" side="bottom">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to inbox">
          <ArrowLeft className="size-4" />
        </Button>
      </SimpleTooltip>

      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <h1 className="truncate text-base font-semibold tracking-tight">
          {thread.subject}
        </h1>
        <CategoryChip
          token={meta.token}
          label={meta.label}
          className="hidden shrink-0 sm:inline-flex"
        />
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <SimpleTooltip label="Archive · e" side="bottom">
          <Button variant="ghost" size="icon-sm" onClick={onArchive} aria-label="Archive">
            <Archive className="size-4" />
          </Button>
        </SimpleTooltip>
        <SimpleTooltip label="Snooze · h" side="bottom">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Snooze"
            onClick={() => {
              snooze.mutate({ id: thread.id, snoozedUntil: tomorrow9am() })
              onBack()
            }}
          >
            <Clock className="size-4" />
          </Button>
        </SimpleTooltip>

        <DropdownMenu>
          <SimpleTooltip label="Move to… · l" side="bottom">
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="hidden sm:inline-flex"
                aria-label="Move to a category"
              >
                <Tag className="size-4" />
              </Button>
            </DropdownMenuTrigger>
          </SimpleTooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Move to…</DropdownMenuLabel>
            {CATEGORY_LIST.map((cat) => (
              <DropdownMenuItem
                key={cat.id}
                onSelect={() => move.mutate({ id: thread.id, labels: [cat.label] })}
              >
                {cat.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <SimpleTooltip label="Remind me · r" side="bottom">
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden sm:inline-flex"
            aria-label="Remind me"
          >
            <AlarmClock className="size-4" />
          </Button>
        </SimpleTooltip>

        <DropdownMenu>
          <SimpleTooltip label="More" side="bottom">
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
          </SimpleTooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                markUnread.mutate(thread.id)
                onBack()
              }}
            >
              <Mail className="size-4" /> Mark as unread
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => toggleStar.mutate({ id: thread.id, starred: !thread.starred })}
            >
              <Star className="size-4" /> {thread.starred ? 'Unstar' : 'Star'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => mute.mutate({ id: thread.id, muted: true })}>
              <BellOff className="size-4" /> Mute thread
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive [&_svg]:text-destructive"
              onSelect={() => {
                deleteThread.mutate(thread.id)
                onBack()
              }}
            >
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
