/**
 * The outbound send path: persist an encrypted outbound `message` and enqueue a
 * deferred `send` job (10s undo window) that the worker executes via the provider
 * adapter.
 *
 * Both composer entry points funnel through here — `POST /messages` (new or
 * existing thread) and `POST /threads/:id/reply` — so message persistence,
 * recipient normalization, and job enqueue stay identical. The API never talks to
 * a provider directly; it records intent and hands the actual send to the worker.
 */
import { asService, withUser } from '@revido/db/client'
import {
  accounts,
  contacts,
  jobs,
  messageRecipients,
  messages,
  threadParticipants,
  threads,
} from '@revido/db/schema'
import type { Message } from '@revido/db'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { upsertContact } from './contacts'
import type { UserCrypto } from './crypto'
import { HttpError } from './http'
import { enqueueJob, JobQueue, sendRunAt } from './jobs'
import { assembleMessages } from './mappers'

/** Crude HTML → text for the stored plaintext body variant. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface RecipientInput {
  email: string
  name?: string
}

export interface ComposeInput {
  threadId?: string
  accountId: string
  to: RecipientInput[]
  cc?: RecipientInput[]
  subject: string
  html: string
}

/** Compose a new message (creating a thread when none is given) and enqueue send. */
export async function sendCompose(
  userId: string,
  crypto: UserCrypto,
  input: ComposeInput,
): Promise<Message> {
  const now = new Date()
  const result = await withUser(userId, async (tx) => {
    const account = (
      await tx.select().from(accounts).where(eq(accounts.id, input.accountId)).limit(1)
    ).at(0)
    if (!account) throw new HttpError(404, 'account_not_found')

    const fromContactId = await upsertContact(tx, userId, {
      email: account.email,
      name: account.name ?? undefined,
    })

    // Resolve the thread (existing or freshly created).
    let threadId = input.threadId
    if (threadId) {
      const thread = (
        await tx.select({ id: threads.id }).from(threads).where(eq(threads.id, threadId)).limit(1)
      ).at(0)
      if (!thread) throw new HttpError(404, 'thread_not_found')
      await tx.update(threads).set({ lastMessageAt: now }).where(eq(threads.id, threadId))
    } else {
      const created = (
        await tx
          .insert(threads)
          .values({
            userId,
            accountId: input.accountId,
            subjectCt: crypto.encrypt(input.subject),
            category: 'awaiting-reply',
            priority: 'normal',
            unread: false,
            awaitingReply: true,
            lastMessageAt: now,
          })
          .returning({ id: threads.id })
      ).at(0)
      if (!created) throw new HttpError(500, 'thread_create_failed')
      threadId = created.id
    }

    const messageRow = (
      await tx
        .insert(messages)
        .values({
          userId,
          threadId,
          accountId: input.accountId,
          fromContactId,
          date: now,
          htmlCt: crypto.encrypt(input.html),
          textCt: crypto.encrypt(stripHtml(input.html)),
          unread: false,
          outbound: true,
        })
        .returning()
    ).at(0)
    if (!messageRow) throw new HttpError(500, 'message_create_failed')

    // Normalize recipients → contacts → message_recipients rows.
    const recipientRows: { messageId: string; contactId: string; kind: 'to' | 'cc'; userId: string }[] =
      []
    const participantContactIds = new Set<string>()
    for (const to of input.to) {
      const contactId = await upsertContact(tx, userId, to)
      recipientRows.push({ messageId: messageRow.id, contactId, kind: 'to', userId })
      participantContactIds.add(contactId)
    }
    for (const cc of input.cc ?? []) {
      const contactId = await upsertContact(tx, userId, cc)
      recipientRows.push({ messageId: messageRow.id, contactId, kind: 'cc', userId })
      participantContactIds.add(contactId)
    }
    if (recipientRows.length) await tx.insert(messageRecipients).values(recipientRows)

    // Seed participants on a freshly created thread.
    if (!input.threadId && participantContactIds.size) {
      await tx
        .insert(threadParticipants)
        .values(
          [...participantContactIds].map((contactId) => ({ threadId, contactId, userId })),
        )
        .onConflictDoNothing()
    }

    const message = (await assembleMessages(tx, crypto, [messageRow])).at(0)
    if (!message) throw new HttpError(500, 'message_assemble_failed')
    return { message, messageId: messageRow.id }
  })

  await enqueueJob(
    JobQueue.send,
    { userId, accountId: input.accountId, messageId: result.messageId },
    { runAt: sendRunAt(now) },
  )
  return result.message
}

/** Reply into an existing thread (recipients = its participants) and enqueue send. */
export async function sendReply(
  userId: string,
  crypto: UserCrypto,
  threadId: string,
  html: string,
): Promise<Message> {
  const now = new Date()
  const result = await withUser(userId, async (tx) => {
    const thread = (
      await tx.select().from(threads).where(eq(threads.id, threadId)).limit(1)
    ).at(0)
    if (!thread) throw new HttpError(404, 'thread_not_found')

    const account = (
      await tx.select().from(accounts).where(eq(accounts.id, thread.accountId)).limit(1)
    ).at(0)
    if (!account) throw new HttpError(404, 'account_not_found')

    const fromContactId = await upsertContact(tx, userId, {
      email: account.email,
      name: account.name ?? undefined,
    })

    const participants = await tx
      .select({ id: contacts.id, email: contacts.email })
      .from(threadParticipants)
      .innerJoin(contacts, eq(threadParticipants.contactId, contacts.id))
      .where(eq(threadParticipants.threadId, threadId))

    const selfEmail = account.email.trim().toLowerCase()
    const recipientContactIds = participants
      .filter((p) => p.email.trim().toLowerCase() !== selfEmail)
      .map((p) => p.id)

    const messageRow = (
      await tx
        .insert(messages)
        .values({
          userId,
          threadId,
          accountId: thread.accountId,
          fromContactId,
          date: now,
          htmlCt: crypto.encrypt(html),
          textCt: crypto.encrypt(stripHtml(html)),
          unread: false,
          outbound: true,
        })
        .returning()
    ).at(0)
    if (!messageRow) throw new HttpError(500, 'message_create_failed')

    if (recipientContactIds.length) {
      await tx.insert(messageRecipients).values(
        recipientContactIds.map((contactId) => ({
          messageId: messageRow.id,
          contactId,
          kind: 'to' as const,
          userId,
        })),
      )
    }

    await tx
      .update(threads)
      .set({ lastMessageAt: now, awaitingReply: true })
      .where(eq(threads.id, threadId))

    const message = (await assembleMessages(tx, crypto, [messageRow])).at(0)
    if (!message) throw new HttpError(500, 'message_assemble_failed')
    return { message, messageId: messageRow.id, accountId: thread.accountId }
  })

  await enqueueJob(
    JobQueue.send,
    { userId, accountId: result.accountId, messageId: result.messageId },
    { runAt: sendRunAt(now) },
  )
  return result.message
}

/**
 * Cancel a pending deferred send (the 10s undo).
 *
 * Returns `true` only if the send was actually withdrawn. The delete is guarded on
 * `locked_at IS NULL`: once the worker has CLAIMED the row (it sets `locked_at`
 * while the status is still `pending`) the send is in flight, so cancelling must
 * lose the race — otherwise we'd delete the local copy of an email that still goes
 * out and tell the user it was cancelled. Under READ COMMITTED the claim's
 * `SELECT … FOR UPDATE SKIP LOCKED` and this `DELETE … WHERE locked_at IS NULL` are
 * mutually exclusive on the row, so exactly one of {claim, cancel} wins. We only
 * drop the outbound message row when we won (a lost race leaves it for the worker
 * to mark sent).
 */
export async function cancelSend(userId: string, messageId: string): Promise<boolean> {
  // Delete only the still-unclaimed pending send job for THIS message + user
  // (JSONB-scoped). If the worker already claimed it, `locked_at` is set and this
  // matches nothing → we lost the race.
  const removed = await asService(async (tx) => {
    return tx
      .delete(jobs)
      .where(
        and(
          eq(jobs.queue, JobQueue.send),
          eq(jobs.status, 'pending'),
          isNull(jobs.lockedAt),
          sql`${jobs.payload} ->> 'messageId' = ${messageId}`,
          sql`${jobs.payload} ->> 'userId' = ${userId}`,
        ),
      )
      .returning({ id: jobs.id })
  })

  // Only drop the never-sent outbound message when we actually withdrew the job.
  if (removed.length === 0) return false
  await withUser(userId, async (tx) => {
    await tx.delete(messages).where(and(eq(messages.id, messageId), eq(messages.outbound, true)))
  })
  return true
}
