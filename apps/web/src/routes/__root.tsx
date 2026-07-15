import { Link, Outlet, createRootRoute } from '@tanstack/react-router'
import { Button } from '@revido/ui'

export const Route = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: () => (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background text-center">
      <div className="text-3xl font-semibold">404</div>
      <p className="text-muted-foreground">This page took a wrong turn.</p>
      <Button asChild variant="outline">
        <Link to="/app">Back to Today</Link>
      </Button>
    </div>
  ),
})
