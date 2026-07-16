// i18n-todo: extract hardcoded copy in this screen to the en/nl catalogs (see apps/web/src/i18n)
import { createFileRoute } from '@tanstack/react-router'
import { CATEGORIES, getThreadsByCategory, type CategoryId } from '@revido/mock-data'
import { CATEGORY_CLASSES, EmptyState, type CategoryToken } from '@revido/ui'
import { Icon } from '@/lib/icons'
import { ThreadList } from '@/components/inbox'

export const Route = createFileRoute('/app/category/$categoryId')({
  component: CategoryScreen,
})

function CategoryScreen() {
  const { categoryId } = Route.useParams()
  const meta = CATEGORIES[categoryId as CategoryId] ?? CATEGORIES.fyi
  const threads = getThreadsByCategory(meta.id)
  const tint = CATEGORY_CLASSES[meta.token as CategoryToken]?.chip

  return (
    <ThreadList
      key={meta.id}
      title={meta.label}
      icon={<Icon name={meta.icon} />}
      iconClassName={tint}
      threads={threads}
      category={meta}
      defaultSort="priority"
      emptyState={
        <EmptyState
          icon={<Icon name={meta.icon} />}
          title={`No ${meta.label} yet`}
          description="Nothing filed here right now. Revido sorts new mail into this category automatically."
        />
      }
    />
  )
}
