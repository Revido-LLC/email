/**
 * Approvals — the human-in-the-loop queue for consequential agent actions.
 *
 * Reads: the queue (`/`) and its badge count (`/count`). Writes resolve an item:
 * approve, reject, edit-then-approve (a corrected preview), and batch-approve
 * (optionally scoped to one agent). Resolving removes the approval row and — for
 * an approval (not a rejection) — records a completed `agent_runs` entry so the
 * activity feed reflects what was executed.
 */
import { withUser } from '@revido/db/client'
import { agentRuns, approvals, threads } from '@revido/db/schema'
import type { DbTransaction } from '@revido/db/client'
import { count, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getUserCrypto, type UserCrypto } from '../lib/crypto'
import { notFound, readJson } from '../lib/http'
import { enqueueJob, JobQueue, sendRunAt, type ForwardJobPayload } from '../lib/jobs'
import { mapApproval } from '../lib/mappers'
import { protectedRouter } from '../lib/protected'

type ApprovalRow = typeof approvals.$inferSelect

const approveSchema = z.object({ editedPreview: z.string().optional() })
const batchApproveSchema = z.object({ agentId: z.string().optional() })

export const approvalsRouter = protectedRouter()

/** Record a completed run for a resolved approval (so the feed shows it). */
async function recordRun(
  tx: DbTransaction,
  crypto: UserCrypto,
  userId: string,
  approval: ApprovalRow,
  summary: string,
): Promise<void> {
  const affected = [
    {
      threadId: approval.threadId ?? '',
      subject: crypto.decrypt(approval.subjectCt),
      sender: approval.sender ?? '',
    },
  ]
  await tx.insert(agentRuns).values({
    userId,
    agentId: approval.agentId,
    agentName: approval.agentName,
    agentIcon: approval.agentIcon,
    at: new Date(),
    summaryCt: crypto.encrypt(summary),
    reasoningCt: crypto.encrypt('Approved by user'),
    affectedCt: crypto.encrypt(JSON.stringify(affected)),
    status: 'done',
    reversible: true,
  })
}

/** GET /approvals — the pending queue, newest first. */
approvalsRouter.get('/', async (c) => {
  const userId = c.get('userId')
  const crypto = await getUserCrypto(userId)
  const list = await withUser(userId, async (tx) => {
    const rows = await tx.select().from(approvals).orderBy(approvals.createdAt)
    return rows.map((row) => mapApproval(crypto, row))
  })
  return c.json(list)
})

/** GET /approvals/count — the badge count. */
approvalsRouter.get('/count', async (c) => {
  const userId = c.get('userId')
  const n = await withUser(userId, async (tx) => {
    const rows = await tx.select({ n: count() }).from(approvals)
    return rows.at(0)?.n ?? 0
  })
  return c.json(n)
})

/**
 * Resolve a `forward` approval into an enqueueable payload, or null when the row
 * isn't a forward or is missing the destination / source message. Looks up the
 * account from the approval's thread so the worker can send from the right mailbox.
 */
async function forwardIntent(
  tx: DbTransaction,
  userId: string,
  approval: ApprovalRow,
): Promise<ForwardJobPayload | null> {
  if (approval.action !== 'forward') return null
  const to = approval.params?.to
  if (!to || !approval.messageId || !approval.threadId) return null
  const thread = (
    await tx.select({ accountId: threads.accountId }).from(threads).where(eq(threads.id, approval.threadId)).limit(1)
  ).at(0)
  if (!thread) return null
  return { userId, accountId: thread.accountId, sourceMessageId: approval.messageId, to }
}

/** POST /approvals/:id/approve — approve, or edit-then-approve with `editedPreview`. */
approvalsRouter.post('/:id/approve', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const { editedPreview } = await readJson(c, approveSchema)
  const crypto = await getUserCrypto(userId)
  const resolved = editedPreview !== undefined ? 'edited' : 'approved'
  const result = await withUser(userId, async (tx) => {
    const row = (await tx.select().from(approvals).where(eq(approvals.id, id)).limit(1)).at(0)
    if (!row) return { ok: false as const, forward: null }
    const forward = await forwardIntent(tx, userId, row)
    await recordRun(tx, crypto, userId, row, editedPreview ?? row.action)
    await tx.delete(approvals).where(eq(approvals.id, id))
    return { ok: true as const, forward }
  })
  if (!result.ok) return notFound(c)
  // Execute an approved forward on the same deferred/undo window as a normal send.
  if (result.forward) {
    await enqueueJob(JobQueue.forward, result.forward, { runAt: sendRunAt() })
  }
  return c.json({ resolved })
})

/** POST /approvals/:id/reject — dismiss without acting. */
approvalsRouter.post('/:id/reject', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const ok = await withUser(userId, async (tx) => {
    const rows = await tx.delete(approvals).where(eq(approvals.id, id)).returning({ id: approvals.id })
    return rows.length > 0
  })
  if (!ok) return notFound(c)
  return c.json({ resolved: 'rejected' })
})

/** POST /approvals/batch-approve — approve everything (or one agent's items). */
approvalsRouter.post('/batch-approve', async (c) => {
  const userId = c.get('userId')
  const { agentId } = await readJson(c, batchApproveSchema)
  const crypto = await getUserCrypto(userId)
  const { ids, forwards } = await withUser(userId, async (tx) => {
    const rows = agentId
      ? await tx.select().from(approvals).where(eq(approvals.agentId, agentId))
      : await tx.select().from(approvals)
    const forwards: ForwardJobPayload[] = []
    for (const row of rows) {
      const forward = await forwardIntent(tx, userId, row)
      if (forward) forwards.push(forward)
      await recordRun(tx, crypto, userId, row, row.action)
    }
    if (rows.length) {
      if (agentId) await tx.delete(approvals).where(eq(approvals.agentId, agentId))
      else await tx.delete(approvals)
      return { ids: rows.map((r) => r.id), forwards }
    }
    return { ids: [] as string[], forwards }
  })
  for (const forward of forwards) {
    await enqueueJob(JobQueue.forward, forward, { runAt: sendRunAt() })
  }
  return c.json({ resolved: ids })
})
