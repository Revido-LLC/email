/**
 * Mail persistence PORTS + shared value types.
 *
 * Consumers depend on these narrow interfaces (not the concrete Postgres store),
 * so their logic is unit-testable with in-memory fakes. `PgMailStore` (see
 * `./pg-store`) is the production implementation; all mailbox content it writes is
 * ciphertext under the account's DEK.
 */

import type { OutputLanguage, Priority } from '@revido/db'
import type { RawFetchedMessage, TriageResult } from '@revido/core'
import type { AccountCrypto } from '../db/accounts'

export interface Contact {
  name: string
  email: string
}

/** Identity + crypto for the account whose content is being written. */
export interface PersistTarget {
  accountId: string
  userId: string
  crypto: AccountCrypto
}

export interface PersistedMessage {
  messageId: string
  threadId: string
  /** False when the message already existed (idempotent re-ingest). */
  isNew: boolean
}

/** Per-account provider cursors + backfill progress. */
export interface SyncStateRow {
  historyId: string | null
  deltaLink: string | null
  backfillCursor: string | null
  backfillComplete: boolean
}

export interface SaveBackfillProgressInput {
  accountId: string
  userId: string
  backfillCursor: string | null
  backfillComplete: boolean
}

export interface SaveCursorInput {
  accountId: string
  userId: string
  historyId?: string | null
  deltaLink?: string | null
}

/** Idempotent upsert of contacts/threads/messages/attachments (encrypts at rest). */
export interface SyncStore {
  persistMessage(target: PersistTarget, msg: RawFetchedMessage): Promise<PersistedMessage>
  deleteMessages(userId: string, providerMessageIds: string[]): Promise<void>
  getSyncState(accountId: string): Promise<SyncStateRow | null>
  /** Advance backfill progress (only touches backfill columns). */
  saveBackfillProgress(input: SaveBackfillProgressInput): Promise<void>
  /** Advance the incremental push cursor (only touches history/delta columns). */
  saveCursor(input: SaveCursorInput): Promise<void>
  setSyncProgress(accountId: string, progress: number, label?: string): Promise<void>
}

/** Decrypted inputs for triage. */
export interface TriageInput {
  subject: string
  from: Contact
  to: Contact[]
  body: string
  date?: string
}

export interface ApplyTriageInput {
  userId: string
  threadId: string
  messageId: string
  crypto: AccountCrypto
  result: TriageResult
}

export interface TriageStore {
  getTriageInput(
    userId: string,
    messageId: string,
    crypto: AccountCrypto,
  ): Promise<TriageInput | null>
  applyTriage(input: ApplyTriageInput): Promise<void>
}

/** Metering — bumps a `usage_counters` row for the period. */
export interface UsageStore {
  increment(userId: string, metric: string, delta?: number, period?: string): Promise<void>
}

/** A thread + its messages, decrypted, for summary/extraction. */
export interface SummaryMessage {
  from: Contact
  date: string
  body: string
  outbound: boolean
}

export interface ThreadForSummary {
  subject: string
  messages: SummaryMessage[]
  priority: Priority
  outputLanguage: OutputLanguage
  detectedLanguage: string | null
}

export interface ExtractedFactInput {
  type: 'date' | 'amount' | 'tracking' | 'link' | 'action' | 'contact'
  label: string
  value: string
  href?: string
}

export interface ApplySummaryInput {
  userId: string
  threadId: string
  crypto: AccountCrypto
  summary: string
  facts: ExtractedFactInput[]
}

export interface EnrichStore {
  getThread(
    userId: string,
    threadId: string,
    crypto: AccountCrypto,
  ): Promise<ThreadForSummary | null>
  applySummary(input: ApplySummaryInput): Promise<void>
}

/** Decrypted outbound message ready for `adapter.send`. */
export interface OutboundMessageData {
  to: Contact[]
  cc?: Contact[]
  bcc?: Contact[]
  subject: string
  html: string
  text: string
  inReplyToProviderMessageId?: string
}

export interface SendStore {
  getOutboundMessage(
    userId: string,
    messageId: string,
    crypto: AccountCrypto,
  ): Promise<OutboundMessageData | null>
  markSent(userId: string, messageId: string, providerMessageId: string): Promise<void>
}

/** The full mail store: every port a consumer might need. */
export interface MailStore extends SyncStore, TriageStore, UsageStore, EnrichStore, SendStore {}
