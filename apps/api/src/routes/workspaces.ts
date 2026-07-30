import { asService } from '@revido/db/client'
import { users, workspaceMemberships, workspaces } from '@revido/db/schema'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { HttpError, notFound, readJson } from '../lib/http'
import { protectedRouter } from '../lib/protected'

const createWorkspaceInput = z.object({ name: z.string().trim().min(1).max(80) })
const policyInput = z.object({
  retentionDays: z.number().int().min(1).max(3650).optional(),
  featureFlags: z.record(z.string(), z.boolean()).optional(),
  aiPolicy: z
    .object({
      drafts: z.boolean(),
      chat: z.boolean(),
      meetings: z.boolean(),
      artifacts: z.boolean(),
    })
    .optional(),
  supportContact: z.string().email().nullable().optional(),
})

export const workspacesRouter = protectedRouter()

async function membership(userId: string, workspaceId: string) {
  return asService(async (tx) =>
    (
      await tx
        .select({ role: workspaceMemberships.role, status: workspaceMemberships.status })
        .from(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.userId, userId),
            eq(workspaceMemberships.workspaceId, workspaceId),
          ),
        )
        .limit(1)
    )[0],
  )
}

workspacesRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const rows = await asService((tx) =>
    tx
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        plan: workspaces.plan,
        trialEndsAt: workspaces.trialEndsAt,
        role: workspaceMemberships.role,
        subscriptionStatus: workspaces.subscriptionStatus,
      })
      .from(workspaceMemberships)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
      .where(
        and(
          eq(workspaceMemberships.userId, userId),
          eq(workspaceMemberships.status, 'active'),
        ),
      ),
  )
  return c.json(rows)
})

workspacesRouter.post('/', async (c) => {
  const userId = c.get('userId')
  const { name } = await readJson(c, createWorkspaceInput)
  const slugBase = name
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 42) || 'workspace'
  const created = await asService(async (tx) => {
    const user = (
      await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1)
    )[0]
    if (!user) throw new HttpError(404, 'user_not_found')
    const suffix = crypto.randomUUID().slice(0, 8)
    const workspace = (
      await tx
        .insert(workspaces)
        .values({
          ownerUserId: userId,
          name,
          slug: `${slugBase}-${suffix}`,
          plan: 'trial',
          trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })
        .returning()
    )[0]
    if (!workspace) throw new HttpError(500, 'workspace_create_failed')
    await tx.insert(workspaceMemberships).values({
      workspaceId: workspace.id,
      userId,
      role: 'owner',
      status: 'active',
    })
    return workspace
  })
  return c.json(created, 201)
})

workspacesRouter.get('/:id', async (c) => {
  const userId = c.get('userId')
  const member = await membership(userId, c.req.param('id'))
  if (!member || member.status !== 'active') return notFound(c)
  const workspace = await asService(async (tx) =>
    (
      await tx.select().from(workspaces).where(eq(workspaces.id, c.req.param('id'))).limit(1)
    )[0],
  )
  return workspace ? c.json({ ...workspace, role: member.role }) : notFound(c)
})

workspacesRouter.patch('/:id/policies', async (c) => {
  const userId = c.get('userId')
  const member = await membership(userId, c.req.param('id'))
  if (!member || member.status !== 'active') return notFound(c)
  if (member.role !== 'owner' && member.role !== 'admin') {
    throw new HttpError(403, 'workspace_admin_required')
  }
  const input = await readJson(c, policyInput)
  const updated = await asService(async (tx) =>
    (
      await tx
        .update(workspaces)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(workspaces.id, c.req.param('id')))
        .returning()
    )[0],
  )
  return c.json(updated)
})

workspacesRouter.get('/:id/members', async (c) => {
  const userId = c.get('userId')
  const member = await membership(userId, c.req.param('id'))
  if (!member || member.status !== 'active') return notFound(c)
  const rows = await asService((tx) =>
    tx
      .select({
        id: workspaceMemberships.id,
        userId: workspaceMemberships.userId,
        role: workspaceMemberships.role,
        status: workspaceMemberships.status,
        email: users.email,
        name: users.name,
      })
      .from(workspaceMemberships)
      .innerJoin(users, eq(users.id, workspaceMemberships.userId))
      .where(eq(workspaceMemberships.workspaceId, c.req.param('id'))),
  )
  return c.json(rows)
})
