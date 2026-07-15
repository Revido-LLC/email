import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '@/components/shell/app-shell'

/** The `/app/*` layout: renders the 3-zone shell; children fill the center stage. */
export const Route = createFileRoute('/app')({
  component: AppShell,
})
