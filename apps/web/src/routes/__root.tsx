import { Link, Outlet, createRootRoute } from '@tanstack/react-router'
import { Button } from '@revido/ui'
import { useTranslation } from 'react-i18next'

function NotFound() {
  const { t } = useTranslation()
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background text-center">
      <div className="text-3xl font-semibold">{t('notFound.title')}</div>
      <p className="text-muted-foreground">{t('notFound.message')}</p>
      <Button asChild variant="outline">
        <Link to="/app">{t('notFound.back')}</Link>
      </Button>
    </div>
  )
}

export const Route = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: NotFound,
})
