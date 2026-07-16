/**
 * Postgres enums — the locked, queryable vocabularies.
 *
 * These mirror the string-union types in `../domain.ts` exactly (same members,
 * same spelling) so a row's enum column round-trips to the domain type without a
 * map. Enum values are plaintext metadata: they're filtered and grouped on, so
 * they never live inside a ciphertext column.
 */
import { pgEnum } from 'drizzle-orm/pg-core'

/** Mail providers. Mirrors `Provider`. */
export const providerEnum = pgEnum('provider', ['gmail', 'outlook'])

/** The 9 locked triage categories. Mirrors `CategoryId`. */
export const categoryEnum = pgEnum('category', [
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

/** Triage priority band. Mirrors `Priority`. */
export const priorityEnum = pgEnum('priority', ['urgent', 'high', 'normal', 'low'])

/** Output-language preference for AI artifacts. Mirrors `OutputLanguage`. */
export const outputLanguageEnum = pgEnum('output_language', ['match', 'en', 'nl'])

/** Extracted-fact kind. Mirrors `ExtractedFactType`. */
export const extractedFactTypeEnum = pgEnum('extracted_fact_type', [
  'date',
  'amount',
  'tracking',
  'link',
  'action',
  'contact',
])

/** Thread-badge kind. Mirrors `ThreadBadge['kind']`. */
export const threadBadgeKindEnum = pgEnum('thread_badge_kind', [
  'attachment',
  'amount',
  'date',
  'tracking',
  'people',
])

/** Attachment display kind. Mirrors `Attachment['kind']`. */
export const attachmentKindEnum = pgEnum('attachment_kind', [
  'pdf',
  'image',
  'doc',
  'sheet',
  'zip',
  'other',
])

/** Agent-run lifecycle. Mirrors `AgentRunStatus`. */
export const agentRunStatusEnum = pgEnum('agent_run_status', [
  'done',
  'pending-approval',
  'reversed',
])

/** Reminder kind. Mirrors `ReminderKind`. */
export const reminderKindEnum = pgEnum('reminder_kind', ['follow-up', 'deadline', 'snoozed'])

/** Message recipient field. */
export const recipientKindEnum = pgEnum('recipient_kind', ['to', 'cc', 'bcc'])

/** Sales-lead lifecycle for the "Talk to Revido" capture. */
export const leadStatusEnum = pgEnum('lead_status', [
  'new',
  'contacted',
  'qualified',
  'won',
  'lost',
])
