/**
 * Agents — the user's inbox automations.
 *
 * Reads list the gallery (optionally `?enabled=true`) and fetch a single agent
 * (404 if absent). Writes create an agent from a compiled `AgentPlan` (persisting
 * its trigger/conditions and its action rows), toggle `enabled`, and delete. Agent
 * config is plaintext settings, so no decryption is involved here. Compile/dry-run
 * are AI endpoints owned by another agent and are intentionally not mounted.
 */
import { withUser } from '@revido/db/client'
import { agentActions, agents } from '@revido/db/schema'
import { agentPlanSchema, actionNeedsApproval, serializeConditionClause } from '@revido/core/agent-plan'
import type { AgentActionType } from '@revido/core/agent-plan'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { notFound, readJson } from '../lib/http'
import { assembleAgents } from '../lib/mappers'
import { protectedRouter } from '../lib/protected'

const createAgentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  /** Opt-in auto-run: consequential actions (forward) run without approval. */
  trusted: z.boolean().optional(),
  plan: agentPlanSchema,
})
const toggleAgentSchema = z.object({ enabled: z.boolean() })

export const agentsRouter = protectedRouter()

/** GET /agents (?enabled=true) — the agent gallery. */
agentsRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const enabledOnly = c.req.query('enabled') === 'true'
  const list = await withUser(userId, async (tx) => {
    const rows = enabledOnly
      ? await tx
          .select()
          .from(agents)
          .where(eq(agents.enabled, true))
          .orderBy(desc(agents.createdAt))
      : await tx.select().from(agents).orderBy(desc(agents.createdAt))
    return assembleAgents(tx, rows)
  })
  return c.json(list)
})

/** GET /agents/:id — one agent (404 if absent). */
agentsRouter.get('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const agent = await withUser(userId, async (tx) => {
    const row = (await tx.select().from(agents).where(eq(agents.id, id)).limit(1)).at(0)
    if (!row) return undefined
    return (await assembleAgents(tx, [row])).at(0)
  })
  if (!agent) return notFound(c)
  return c.json(agent)
})

/** POST /agents — create + enable an agent from a compiled plan. */
agentsRouter.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await readJson(c, createAgentSchema)
  const agent = await withUser(userId, async (tx) => {
    const created = (
      await tx
        .insert(agents)
        .values({
          userId,
          name: body.name,
          description: body.description ?? null,
          enabled: true,
          trigger: body.plan.trigger,
          conditions: body.plan.conditions.map(serializeConditionClause),
          prebuilt: false,
          trusted: body.trusted ?? false,
        })
        .returning()
    ).at(0)
    if (!created) throw new Error('agent_create_failed')

    if (body.plan.actions.length) {
      await tx.insert(agentActions).values(
        body.plan.actions.map((action, position) => ({
          userId,
          agentId: created.id,
          type: action.type,
          label: action.label,
          needsApproval: actionNeedsApproval(action.type as AgentActionType),
          position,
          params: action.params ?? null,
        })),
      )
    }
    return (await assembleAgents(tx, [created])).at(0)
  })
  return c.json(agent, 201)
})

/** PATCH /agents/:id — enable / disable. */
agentsRouter.patch('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const { enabled } = await readJson(c, toggleAgentSchema)
  const agent = await withUser(userId, async (tx) => {
    const updated = (
      await tx.update(agents).set({ enabled }).where(eq(agents.id, id)).returning()
    ).at(0)
    if (!updated) return undefined
    return (await assembleAgents(tx, [updated])).at(0)
  })
  if (!agent) return notFound(c)
  return c.json(agent)
})

/** DELETE /agents/:id — remove an agent. */
agentsRouter.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const deleted = await withUser(userId, async (tx) => {
    const rows = await tx.delete(agents).where(eq(agents.id, id)).returning({ id: agents.id })
    return rows.length > 0
  })
  if (!deleted) return notFound(c)
  return c.json({ deleted: true })
})
