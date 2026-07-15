import { CATEGORIES, type Thread } from '@revido/mock-data'
import {
  Button,
  CategoryChip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  FolderInput,
  Mail,
  MoreHorizontal,
  Star,
  Tag,
  Trash2,
} from 'lucide-react'

interface Props {
  thread: Thread
  onBack: () => void
  onArchive: () => void
}

export function ThreadTopBar({ thread, onBack, onArchive }: Props) {
  const meta = CATEGORIES[thread.category]
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
          <Button variant="ghost" size="icon-sm" aria-label="Snooze">
            <Clock className="size-4" />
          </Button>
        </SimpleTooltip>
        <SimpleTooltip label="Label · l" side="bottom">
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden sm:inline-flex"
            aria-label="Label"
          >
            <Tag className="size-4" />
          </Button>
        </SimpleTooltip>
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
            <DropdownMenuItem>
              <Mail className="size-4" /> Mark as unread
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Star className="size-4" /> {thread.starred ? 'Unstar' : 'Star'}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <FolderInput className="size-4" /> Move to…
            </DropdownMenuItem>
            <DropdownMenuItem>
              <BellOff className="size-4" /> Mute thread
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive [&_svg]:text-destructive">
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
