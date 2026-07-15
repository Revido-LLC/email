import {
  Bell,
  Calendar,
  CalendarClock,
  Circle,
  Clock,
  FolderInput,
  Heart,
  Info,
  MailX,
  Newspaper,
  Receipt,
  Reply,
  Send,
  Tag,
  type LucideProps,
} from 'lucide-react'

/**
 * Resolve a lucide icon by name. Mock-data stores icon names as strings so the
 * data layer stays presentation-free; this maps that finite set to components.
 *
 * We intentionally import each icon by name (not `import * as`) so the bundle
 * tree-shakes to just these icons instead of the whole library. Keep this map
 * in sync with the `icon` strings in @revido/mock-data (categories + agents).
 */
const registry: Record<string, React.ComponentType<LucideProps>> = {
  Bell,
  Calendar,
  CalendarClock,
  Clock,
  FolderInput,
  Heart,
  Info,
  MailX,
  Newspaper,
  Receipt,
  Reply,
  Send,
  Tag,
}

export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const Cmp = registry[name] ?? Circle
  return <Cmp {...props} />
}
