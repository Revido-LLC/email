/**
 * The router registry — the seam `app.ts` mounts.
 *
 * auth-persistence shipped this empty; api-service fills `routers[]` with one
 * sub-app per resource group. `app.ts` mounts each entry with
 * `app.route(path, router)`, keeping `app.ts` itself untouched. Every user-scoped
 * router is a `protectedRouter()` (mounts `requireUser`); the OAuth + webhook
 * routers manage their own auth (session/HMAC/OIDC) and rate limiting.
 *
 * The AI surface (api-ai) adds the streaming `/ai/*` router, the agent-authoring
 * `/agents/compile` + `/agents/dry-run` router (mounted alongside the CRUD
 * `/agents` router — Hono merges the two route tables), and the public `/leads`
 * capture. Each manages its own rate limiting (and, for `/leads`, optional auth).
 */
import type { Hono } from 'hono'
import type { Variables } from '../middleware/auth'
import { accountsRouter } from './accounts'
import { accountMgmtRouter } from './account'
import { agentRunsRouter } from './agent-runs'
import { agentsRouter } from './agents'
import { agentsAiRouter } from './agents-ai'
import { aiRouter } from './ai'
import { approvalsRouter } from './approvals'
import { attachmentsRouter } from './attachments'
import { categoriesRouter } from './categories'
import { commitmentsRouter } from './commitments'
import { leadsRouter } from './leads'
import { meRouter } from './me'
import { messagesRouter } from './messages'
import { oauthRouter } from './oauth'
import { onboardingRouter } from './onboarding'
import { remindersRouter } from './reminders'
import { settingsRouter } from './settings'
import { signaturesRouter } from './signatures'
import { threadsRouter } from './threads'
import { todayRouter } from './today'
import { usageRouter } from './usage'
import { webhooksRouter } from './webhooks'

export interface RouterEntry {
  path: string
  // Every sub-app shares the `{ Variables }` env (protected routers read
  // `userId`; the public oauth/webhook routers just don't set it). `app.ts` mounts
  // each with `app.route`, which accepts a sub-app of any env.
  router: Hono<{ Variables: Variables }>
}

export const routers: RouterEntry[] = [
  // User-scoped content (requireUser).
  { path: '/threads', router: threadsRouter },
  { path: '/categories', router: categoriesRouter },
  { path: '/agents', router: agentsRouter },
  { path: '/agent-runs', router: agentRunsRouter },
  { path: '/approvals', router: approvalsRouter },
  { path: '/reminders', router: remindersRouter },
  { path: '/commitments', router: commitmentsRouter },
  { path: '/accounts', router: accountsRouter },
  { path: '/signatures', router: signaturesRouter },
  { path: '/me', router: meRouter },
  { path: '/today', router: todayRouter },
  { path: '/onboarding', router: onboardingRouter },
  { path: '/usage', router: usageRouter },
  { path: '/settings', router: settingsRouter },
  { path: '/account', router: accountMgmtRouter },
  { path: '/messages', router: messagesRouter },
  { path: '/attachments', router: attachmentsRouter },
  // AI surface (api-ai): self-managed rate limiting; the agents-ai router shares
  // the `/agents` base path with the CRUD router (Hono merges both route tables).
  { path: '/ai', router: aiRouter },
  { path: '/agents', router: agentsAiRouter },
  { path: '/leads', router: leadsRouter },
  // Self-managed auth (session/HMAC/OIDC) + rate limiting.
  { path: '/auth/oauth', router: oauthRouter },
  { path: '/webhooks', router: webhooksRouter },
]
