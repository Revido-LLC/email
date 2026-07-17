// i18n-todo: extract hardcoded copy in this screen to the en/nl catalogs (see apps/web/src/i18n)
import { Link, createFileRoute } from '@tanstack/react-router'
import { Button, EmptyState } from '@revido/ui'
import { Inbox, Sparkles } from 'lucide-react'
import { ThreadList } from '@/components/inbox'
import { useNeedsYou } from '@/lib/hooks'

export const Route = createFileRoute('/app/inbox')({
  component: InboxScreen,
})

function InboxScreen() {
  const { data: threads, isPending } = useNeedsYou()

  return (
    <ThreadList
      title="Needs You"
      icon={<Inbox />}
      iconClassName="bg-primary/12 text-primary"
      threads={threads ?? []}
      loading={isPending}
      defaultSort="priority"
      emptyState={
        <EmptyState
          icon={<Sparkles />}
          title="Inbox zero"
          description="Nothing needs you right now. The rest is handled — Revido will surface what matters next."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/app">Back to Today</Link>
            </Button>
          }
        />
      }
    />
  )
}
