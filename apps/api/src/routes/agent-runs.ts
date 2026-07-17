/**
 * Agent runs — the activity feed.
 *
 * `GET /agent-runs?agentId=` lists the run history (optionally per-agent), newest
 * first, decrypting each run's summary/reasoning/affected snapshot. `POST
 * /agent-runs/:id/undo` reverses a reversible run (status → `reversed`); the
 * worker performs the actual provider-side rollback.
 */
import { withUser } from '@revido/db/client'
import { agentRuns } from '@revido/db/schema'
import { desc, eq } from 'drizzle-orm'
import { getUserCrypto } from '../lib/crypto'
import { notFound } from '../lib/http'
import { mapAgentRun } from '../lib/mappers'
import { protectedRouter } from '../lib/protected'

export const agentRunsRouter = protectedRouter()

/** GET /agent-runs (?agentId=) — run history, newest first. */
agentRunsRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const agentId = c.req.query('agentId')
  const crypto = await getUserCrypto(userId)
  const list = await withUser(userId, async (tx) => {
    const rows = agentId
      ? await tx
          .select()
          .from(agentRuns)
          .where(eq(agentRuns.agentId, agentId))
          .orderBy(desc(agentRuns.at))
      : await tx.select().from(agentRuns).orderBy(desc(agentRuns.at))
    return rows.map((row) => mapAgentRun(crypto, row))
  })
  return c.json(list)
})

/** POST /agent-runs/:id/undo — reverse a reversible run. */
agentRunsRouter.post('/:id/undo', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const crypto = await getUserCrypto(userId)
  const run = await withUser(userId, async (tx) => {
    const updated = (
      await tx
        .update(agentRuns)
        .set({ status: 'reversed' })
        .where(eq(agentRuns.id, id))
        .returning()
    ).at(0)
    return updated ? mapAgentRun(crypto, updated) : undefined
  })
  if (!run) return notFound(c)
  return c.json(run)
})
