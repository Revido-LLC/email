/**
 * Onboarding — the post-connect "reading your mailbox" screen.
 *
 * `GET /onboarding/scan` derives the reading-stage counters from the freshly
 * backfilled mailbox and attaches the proposal catalog. `GET /onboarding/
 * agent-proposals` serves that static catalog on its own. `POST /onboarding/agents`
 * instantiates the chosen proposals into enabled `agents` rows and returns them.
 */
import { withUser } from '@revido/db/client'
import type { DbTransaction } from '@revido/db/client'
import { agentActions, agents, threads } from '@revido/db/schema'
import { actionNeedsApproval } from '@revido/core/agent-plan'
import type { AgentActionType } from '@revido/core/agent-plan'
import type { CategoryId, OnboardingScanResult } from '@revido/db'
import { count, eq, or } from 'drizzle-orm'
import { z } from 'zod'
import { AGENT_PROPOSALS, PREBUILT_AGENTS } from '../lib/catalog'
import { readJson } from '../lib/http'
import { assembleAgents } from '../lib/mappers'
import { protectedRouter } from '../lib/protected'

const enableAgentsSchema = z.object({ agentIds: z.array(z.string()).min(1) })

export const onboardingRouter = protectedRouter()

async function categoryCount(tx: DbTransaction, category: CategoryId): Promise<number> {
  const rows = await tx.select({ n: count() }).from(threads).where(eq(threads.category, category))
  return rows.at(0)?.n ?? 0
}

/** GET /onboarding/scan — reading-stage counters + proposals. */
onboardingRouter.get('/scan', async (c) => {
  const userId = c.get('userId')
  const scan = await withUser(userId, async (tx): Promise<OnboardingScanResult> => {
    const totalThreads = (await tx.select({ n: count() }).from(threads)).at(0)?.n ?? 0
    const needReplies = await categoryCount(tx, 'to-reply')
    const newsletters = await categoryCount(tx, 'newsletters')
    const invoices = await categoryCount(tx, 'receipts')
    const awaitingRows = await tx
      .select({ n: count() })
      .from(threads)
      .where(or(eq(threads.category, 'awaiting-reply'), eq(threads.awaitingReply, true)))
    const awaitingReply = awaitingRows.at(0)?.n ?? 0
    return {
      totalThreads,
      needReplies,
      newsletters,
      invoices,
      awaitingReply,
      proposals: AGENT_PROPOSALS,
    }
  })
  return c.json(scan)
})

/** GET /onboarding/agent-proposals — the proposal catalog. */
onboardingRouter.get('/agent-proposals', (c) => {
  return c.json(AGENT_PROPOSALS)
})

/** POST /onboarding/agents — enable the chosen proposals as agents. */
onboardingRouter.post('/agents', async (c) => {
  const userId = c.get('userId')
  const { agentIds } = await readJson(c, enableAgentsSchema)
  const created = await withUser(userId, async (tx) => {
    const rows: (typeof agents.$inferSelect)[] = []
    for (const proposalId of agentIds) {
      const template = PREBUILT_AGENTS[proposalId]
      if (!template) continue
      const agentRow = (
        await tx
          .insert(agents)
          .values({
            userId,
            name: template.name,
            description: template.description,
            icon: template.icon,
            accent: template.accent,
            enabled: true,
            trigger: template.trigger,
            conditions: template.conditions,
            prebuilt: true,
          })
          .returning()
      ).at(0)
      if (!agentRow) continue
      if (template.actions.length) {
        await tx.insert(agentActions).values(
          template.actions.map((action, position) => ({
            userId,
            agentId: agentRow.id,
            type: action.type,
            label: action.label,
            needsApproval: actionNeedsApproval(action.type as AgentActionType),
            position,
          })),
        )
      }
      rows.push(agentRow)
    }
    return assembleAgents(tx, rows)
  })
  return c.json(created)
})
