/**
 * Zod request/response schemas — the shared validation contract (W1/W2).
 *
 * Two layers:
 *  1. Table schemas derived from Drizzle via `drizzle-zod`
 *     (`createInsertSchema` / `createSelectSchema`). Named `<table>InsertSchema`
 *     / `<table>SelectSchema`. Consumed by `apps/api` for row-shaped validation.
 *  2. Hand-written API DTOs (grouped in the exported `Dto` object) for shapes the
 *     frontend uses that differ from a raw row — e.g. the assembled `Contact`,
 *     nested attachment/badge shapes, and mutation request bodies.
 *
 * `ciphertextSchema` validates the on-the-wire `Ciphertext` envelope shape.
 */
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { CRYPTO_SCHEME_VERSION } from './crypto'
import {
  accounts,
  agentActions,
  agentRuns,
  agents,
  approvals,
  attachments,
  auditLog,
  commitments,
  contacts,
  extractedFacts,
  leads,
  messageEmbeddings,
  messageRecipients,
  messages,
  reminders,
  signatures,
  syncState,
  threadBadges,
  threadParticipants,
  threads,
  usageCounters,
  userKeys,
  users,
} from './schema'

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** The DEK-encrypted envelope stored in every `*Ct` column. */
export const ciphertextSchema = z.object({
  ct: z.string(),
  iv: z.string(),
  tag: z.string(),
  v: z.number().int().default(CRYPTO_SCHEME_VERSION),
})

/** The 9 locked triage categories. */
export const categorySchema = z.enum([
  'to-reply',
  'awaiting-reply',
  'fyi',
  'newsletters',
  'notifications',
  'promotions',
  'receipts',
  'calendar',
  'personal',
])

export const prioritySchema = z.enum(['urgent', 'high', 'normal', 'low'])
export const providerSchema = z.enum(['gmail', 'outlook'])
export const outputLanguageSchema = z.enum(['match', 'en', 'nl'])

// ---------------------------------------------------------------------------
// Table schemas (drizzle-zod)
// ---------------------------------------------------------------------------

export const usersInsertSchema = createInsertSchema(users)
export const usersSelectSchema = createSelectSchema(users)

export const userKeysInsertSchema = createInsertSchema(userKeys)
export const userKeysSelectSchema = createSelectSchema(userKeys)

export const accountsInsertSchema = createInsertSchema(accounts)
export const accountsSelectSchema = createSelectSchema(accounts)

export const contactsInsertSchema = createInsertSchema(contacts)
export const contactsSelectSchema = createSelectSchema(contacts)

export const syncStateInsertSchema = createInsertSchema(syncState)
export const syncStateSelectSchema = createSelectSchema(syncState)

export const threadsInsertSchema = createInsertSchema(threads)
export const threadsSelectSchema = createSelectSchema(threads)

export const threadParticipantsInsertSchema = createInsertSchema(threadParticipants)
export const threadParticipantsSelectSchema = createSelectSchema(threadParticipants)

export const messagesInsertSchema = createInsertSchema(messages)
export const messagesSelectSchema = createSelectSchema(messages)

export const messageRecipientsInsertSchema = createInsertSchema(messageRecipients)
export const messageRecipientsSelectSchema = createSelectSchema(messageRecipients)

export const attachmentsInsertSchema = createInsertSchema(attachments)
export const attachmentsSelectSchema = createSelectSchema(attachments)

export const extractedFactsInsertSchema = createInsertSchema(extractedFacts)
export const extractedFactsSelectSchema = createSelectSchema(extractedFacts)

export const threadBadgesInsertSchema = createInsertSchema(threadBadges)
export const threadBadgesSelectSchema = createSelectSchema(threadBadges)

export const messageEmbeddingsInsertSchema = createInsertSchema(messageEmbeddings)
export const messageEmbeddingsSelectSchema = createSelectSchema(messageEmbeddings)

export const agentsInsertSchema = createInsertSchema(agents)
export const agentsSelectSchema = createSelectSchema(agents)

export const agentActionsInsertSchema = createInsertSchema(agentActions)
export const agentActionsSelectSchema = createSelectSchema(agentActions)

export const agentRunsInsertSchema = createInsertSchema(agentRuns)
export const agentRunsSelectSchema = createSelectSchema(agentRuns)

export const approvalsInsertSchema = createInsertSchema(approvals)
export const approvalsSelectSchema = createSelectSchema(approvals)

export const remindersInsertSchema = createInsertSchema(reminders)
export const remindersSelectSchema = createSelectSchema(reminders)

export const commitmentsInsertSchema = createInsertSchema(commitments)
export const commitmentsSelectSchema = createSelectSchema(commitments)

export const signaturesInsertSchema = createInsertSchema(signatures)
export const signaturesSelectSchema = createSelectSchema(signatures)

export const leadsInsertSchema = createInsertSchema(leads)
export const leadsSelectSchema = createSelectSchema(leads)

export const usageCountersInsertSchema = createInsertSchema(usageCounters)
export const usageCountersSelectSchema = createSelectSchema(usageCounters)

export const auditLogInsertSchema = createInsertSchema(auditLog)
export const auditLogSelectSchema = createSelectSchema(auditLog)

// ---------------------------------------------------------------------------
// Hand-written API DTOs — frontend-facing shapes that differ from a raw row.
// These mirror the interfaces in `./domain.ts` (decrypted, assembled).
// ---------------------------------------------------------------------------

/** Assembled contact (denormalized from the `contacts` table for the client). */
const contactDto = z.object({
  name: z.string(),
  email: z.string().email(),
  avatarUrl: z.string().url().optional(),
})

/** Attachment as the client sees it (decrypted, display metadata only). */
const attachmentDto = z.object({
  id: z.string(),
  name: z.string(),
  size: z.string(),
  mime: z.string(),
  kind: z.enum(['pdf', 'image', 'doc', 'sheet', 'zip', 'other']),
})

const threadBadgeDto = z.object({
  kind: z.enum(['attachment', 'amount', 'date', 'tracking', 'people']),
  label: z.string(),
})

const extractedFactDto = z.object({
  type: z.enum(['date', 'amount', 'tracking', 'link', 'action', 'contact']),
  label: z.string(),
  value: z.string(),
  done: z.boolean().optional(),
  href: z.string().optional(),
})

/** Body for the "Talk to Revido" lead capture (IA S12). */
const createLeadRequest = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  company: z.string().optional(),
  message: z.string().max(4000).optional(),
  source: z.string().optional(),
})

/** Body for composing/sending a message from the frontend. */
const sendMessageRequest = z.object({
  threadId: z.string().optional(),
  accountId: z.string(),
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string(),
  html: z.string(),
  text: z.string().optional(),
  attachmentIds: z.array(z.string()).optional(),
  /** ISO timestamp to defer the send; omit to send now. */
  sendAt: z.string().datetime().optional(),
})

/** Mutations on a thread's triage state (star/snooze/category/read). */
const updateThreadRequest = z.object({
  starred: z.boolean().optional(),
  unread: z.boolean().optional(),
  category: categorySchema.optional(),
  snoozedUntil: z.string().datetime().nullable().optional(),
  labels: z.array(z.string()).optional(),
})

/** Approve/reject an agent action in the approval queue. */
const decideApprovalRequest = z.object({
  approvalId: z.string(),
  decision: z.enum(['approve', 'reject']),
})

/** The DTO namespace — request/response shapes for the API contract. */
export const Dto = {
  contact: contactDto,
  attachment: attachmentDto,
  threadBadge: threadBadgeDto,
  extractedFact: extractedFactDto,
  createLeadRequest,
  sendMessageRequest,
  updateThreadRequest,
  decideApprovalRequest,
} as const

export type ContactDto = z.infer<typeof contactDto>
export type AttachmentDto = z.infer<typeof attachmentDto>
export type CreateLeadRequest = z.infer<typeof createLeadRequest>
export type SendMessageRequest = z.infer<typeof sendMessageRequest>
export type UpdateThreadRequest = z.infer<typeof updateThreadRequest>
export type DecideApprovalRequest = z.infer<typeof decideApprovalRequest>
export type CiphertextInput = z.infer<typeof ciphertextSchema>
