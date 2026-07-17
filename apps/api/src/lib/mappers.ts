/**
 * Row ⇄ DTO mappers: turn encrypted-at-rest Drizzle rows into the plaintext
 * domain DTOs the frontend consumes (and back).
 *
 * The storage boundary is asymmetric: metadata (ids, categories, flags, dates,
 * labels) is plaintext and queryable, while content (subjects, bodies, all
 * AI-derived text) lives in `*Ct` (Ciphertext jsonb) columns. Every mapper takes a
 * {@link UserCrypto} and decrypts those columns into the domain fields — so a
 * `Thread`/`Message`/`Approval`/… crosses the wire fully decrypted, exactly as the
 * mock shaped it.
 *
 * List reads batch-load the related rows (participants, badges, facts, recipients,
 * attachments, actions) with a single `inArray` query each, then stitch them in
 * memory, to avoid a per-row fan-out.
 */
import type { DbTransaction } from '@revido/db/client'
import {
  accounts,
  agentActions,
  agentRuns,
  agents,
  approvals,
  attachments,
  commitments,
  contacts,
  extractedFacts,
  messageRecipients,
  messages,
  reminders,
  signatures,
  threadBadges,
  threadParticipants,
  threads,
} from '@revido/db/schema'
import type {
  Account,
  AgentAction,
  AgentDef,
  AgentRunEntry,
  Approval,
  Attachment,
  Commitment,
  Contact,
  ExtractedFact,
  Message,
  Reminder,
  Signature,
  Thread,
  ThreadBadge,
} from '@revido/db'
import { asc, eq, inArray } from 'drizzle-orm'
import type { UserCrypto } from './crypto'

type ThreadRow = typeof threads.$inferSelect
type MessageRow = typeof messages.$inferSelect
type AccountRow = typeof accounts.$inferSelect
type AgentRow = typeof agents.$inferSelect
type AgentRunRow = typeof agentRuns.$inferSelect
type ApprovalRow = typeof approvals.$inferSelect
type ReminderRow = typeof reminders.$inferSelect
type CommitmentRow = typeof commitments.$inferSelect
type SignatureRow = typeof signatures.$inferSelect

/** ISO 8601 string from a `timestamptz` column (or null passthrough). */
function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null
}

/** Assemble a `Contact` from a contact-shaped projection, coercing nulls. */
function toContact(row: { name: string | null; email: string; avatarUrl: string | null }): Contact {
  const contact: Contact = { name: row.name ?? '', email: row.email }
  if (row.avatarUrl) contact.avatarUrl = row.avatarUrl
  return contact
}

/** Group an array by a string key into a Map of arrays. */
function groupBy<T, K extends string>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const row of rows) {
    const k = key(row)
    const bucket = map.get(k)
    if (bucket) bucket.push(row)
    else map.set(k, [row])
  }
  return map
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

/** Batch-assemble full `Thread` DTOs (participants, badges, facts, messageIds). */
export async function assembleThreads(
  tx: DbTransaction,
  crypto: UserCrypto,
  rows: ThreadRow[],
): Promise<Thread[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)

  const participantRows = await tx
    .select({
      threadId: threadParticipants.threadId,
      name: contacts.name,
      email: contacts.email,
      avatarUrl: contacts.avatarUrl,
    })
    .from(threadParticipants)
    .innerJoin(contacts, eq(threadParticipants.contactId, contacts.id))
    .where(inArray(threadParticipants.threadId, ids))

  const badgeRows = await tx
    .select()
    .from(threadBadges)
    .where(inArray(threadBadges.threadId, ids))
    .orderBy(asc(threadBadges.position))

  const factRows = await tx
    .select()
    .from(extractedFacts)
    .where(inArray(extractedFacts.threadId, ids))
    .orderBy(asc(extractedFacts.position))

  const messageRows = await tx
    .select({ id: messages.id, threadId: messages.threadId, date: messages.date })
    .from(messages)
    .where(inArray(messages.threadId, ids))
    .orderBy(asc(messages.date))

  const participantsByThread = groupBy(participantRows, (r) => r.threadId)
  const badgesByThread = groupBy(badgeRows, (r) => r.threadId)
  const factsByThread = groupBy(factRows, (r) => r.threadId)
  const messagesByThread = groupBy(messageRows, (r) => r.threadId)

  return rows.map((row) => {
    const badges: ThreadBadge[] = (badgesByThread.get(row.id) ?? []).map((b) => ({
      kind: b.kind,
      label: crypto.decrypt(b.labelCt),
    }))
    const extracted: ExtractedFact[] = (factsByThread.get(row.id) ?? []).map((f) => {
      const fact: ExtractedFact = {
        type: f.type,
        label: crypto.decrypt(f.labelCt),
        value: crypto.decrypt(f.valueCt),
        done: f.done,
      }
      const href = crypto.decryptOptional(f.hrefCt)
      if (href) fact.href = href
      return fact
    })
    const thread: Thread = {
      id: row.id,
      accountId: row.accountId,
      subject: crypto.decrypt(row.subjectCt),
      participants: (participantsByThread.get(row.id) ?? []).map(toContact),
      category: row.category,
      priority: row.priority,
      priorityScore: row.priorityScore,
      tldr: crypto.decrypt(row.tldrCt),
      summary: crypto.decrypt(row.summaryCt),
      unread: row.unread,
      starred: row.starred,
      snoozedUntil: iso(row.snoozedUntil),
      hasAttachments: row.hasAttachments,
      badges,
      extracted,
      messageIds: (messagesByThread.get(row.id) ?? []).map((m) => m.id),
      lastMessageAt: row.lastMessageAt.toISOString(),
      awaitingReply: row.awaitingReply,
      labels: row.labels,
    }
    if (row.language) thread.language = row.language
    return thread
  })
}

/** Assemble a single `Thread`, or `undefined` when the row is absent. */
export async function assembleThread(
  tx: DbTransaction,
  crypto: UserCrypto,
  row: ThreadRow | undefined,
): Promise<Thread | undefined> {
  if (!row) return undefined
  const [thread] = await assembleThreads(tx, crypto, [row])
  return thread
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** Batch-assemble `Message` DTOs (sender, to/cc recipients, attachments). */
export async function assembleMessages(
  tx: DbTransaction,
  crypto: UserCrypto,
  rows: MessageRow[],
): Promise<Message[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)

  const recipientRows = await tx
    .select({
      messageId: messageRecipients.messageId,
      kind: messageRecipients.kind,
      name: contacts.name,
      email: contacts.email,
      avatarUrl: contacts.avatarUrl,
    })
    .from(messageRecipients)
    .innerJoin(contacts, eq(messageRecipients.contactId, contacts.id))
    .where(inArray(messageRecipients.messageId, ids))

  const attachmentRows = await tx
    .select()
    .from(attachments)
    .where(inArray(attachments.messageId, ids))

  const fromIds = rows.map((r) => r.fromContactId).filter((v): v is string => Boolean(v))
  const fromRows = fromIds.length
    ? await tx
        .select({
          id: contacts.id,
          name: contacts.name,
          email: contacts.email,
          avatarUrl: contacts.avatarUrl,
        })
        .from(contacts)
        .where(inArray(contacts.id, fromIds))
    : []

  const recipientsByMessage = groupBy(recipientRows, (r) => r.messageId)
  // `messageId` is nullable on the row (pending uploads), but this query only
  // selects attachments already linked to `ids`, so a null never actually keys here.
  const attachmentsByMessage = groupBy(attachmentRows, (r) => r.messageId ?? '')
  const contactById = new Map(fromRows.map((r) => [r.id, r]))

  return rows.map((row) => {
    const recipients = recipientsByMessage.get(row.id) ?? []
    const to = recipients.filter((r) => r.kind === 'to').map(toContact)
    const cc = recipients.filter((r) => r.kind === 'cc').map(toContact)
    const fromRow = row.fromContactId ? contactById.get(row.fromContactId) : undefined

    const attachmentDtos: Attachment[] = (attachmentsByMessage.get(row.id) ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      size: a.size ?? '',
      mime: a.mime ?? '',
      kind: a.kind,
    }))

    const message: Message = {
      id: row.id,
      threadId: row.threadId,
      from: fromRow ? toContact(fromRow) : { name: '', email: '' },
      to,
      date: row.date.toISOString(),
      html: crypto.decrypt(row.htmlCt),
      text: crypto.decrypt(row.textCt),
      unread: row.unread,
      outbound: row.outbound,
      attachments: attachmentDtos,
    }
    if (cc.length) message.cc = cc
    if (row.imagesBlocked) message.imagesBlocked = row.imagesBlocked
    if (row.language) message.language = row.language
    return message
  })
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

/** Map an account row to the DTO (OAuth tokens are never exposed). */
export function mapAccount(row: AccountRow): Account {
  const account: Account = {
    id: row.id,
    provider: row.provider,
    email: row.email,
    name: row.name ?? '',
    syncProgress: row.syncProgress,
    syncLabel: row.syncLabel ?? '',
  }
  if (row.avatarUrl) account.avatarUrl = row.avatarUrl
  return account
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

/** Batch-assemble `AgentDef` DTOs, attaching each agent's action rows. */
export async function assembleAgents(
  tx: DbTransaction,
  rows: AgentRow[],
): Promise<AgentDef[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const actionRows = await tx
    .select()
    .from(agentActions)
    .where(inArray(agentActions.agentId, ids))
    .orderBy(asc(agentActions.position))
  const actionsByAgent = groupBy(actionRows, (r) => r.agentId)

  return rows.map((row) => {
    const actions: AgentAction[] = (actionsByAgent.get(row.id) ?? []).map((a) => ({
      type: a.type,
      label: a.label,
      needsApproval: a.needsApproval,
    }))
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      icon: row.icon ?? '',
      enabled: row.enabled,
      trigger: row.trigger ?? '',
      conditions: row.conditions,
      actions,
      runCount: row.runCount,
      affectedCount: row.affectedCount,
      prebuilt: row.prebuilt,
      accent: row.accent ?? '',
    }
  })
}

/** Decrypt an agent-run row's `affected` snapshot (`JSON` inside one Ciphertext). */
function parseAffected(json: string): AgentRunEntry['affected'] {
  if (!json) return []
  try {
    const parsed: unknown = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed as AgentRunEntry['affected']
  } catch {
    return []
  }
}

export function mapAgentRun(crypto: UserCrypto, row: AgentRunRow): AgentRunEntry {
  return {
    id: row.id,
    agentId: row.agentId ?? '',
    agentName: row.agentName ?? '',
    agentIcon: row.agentIcon ?? '',
    at: row.at.toISOString(),
    summary: crypto.decrypt(row.summaryCt),
    reasoning: crypto.decrypt(row.reasoningCt),
    affected: parseAffected(crypto.decrypt(row.affectedCt)),
    status: row.status,
    reversible: row.reversible,
  }
}

// ---------------------------------------------------------------------------
// Approvals / reminders / commitments / signatures
// ---------------------------------------------------------------------------

export function mapApproval(crypto: UserCrypto, row: ApprovalRow): Approval {
  return {
    id: row.id,
    agentId: row.agentId ?? '',
    agentName: row.agentName ?? '',
    agentIcon: row.agentIcon ?? '',
    action: row.action,
    threadId: row.threadId ?? '',
    subject: crypto.decrypt(row.subjectCt),
    sender: row.sender ?? '',
    preview: crypto.decrypt(row.previewCt),
    createdAt: row.createdAt.toISOString(),
  }
}

export function mapReminder(crypto: UserCrypto, row: ReminderRow): Reminder {
  const reminder: Reminder = {
    id: row.id,
    kind: row.kind,
    threadId: row.threadId ?? '',
    subject: crypto.decrypt(row.subjectCt),
    context: crypto.decrypt(row.contextCt),
    sender: row.sender ?? '',
    dueAt: row.dueAt.toISOString(),
  }
  const draft = crypto.decryptOptional(row.draftReplyCt)
  if (draft) reminder.draftReply = draft
  return reminder
}

export function mapCommitment(crypto: UserCrypto, row: CommitmentRow): Commitment {
  return {
    id: row.id,
    text: crypto.decrypt(row.textCt),
    threadId: row.threadId ?? '',
    subject: crypto.decrypt(row.subjectCt),
    counterpart: row.counterpart ?? '',
    dueAt: row.dueAt.toISOString(),
  }
}

export function mapSignature(crypto: UserCrypto, row: SignatureRow): Signature {
  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    html: crypto.decrypt(row.htmlCt),
  }
}
