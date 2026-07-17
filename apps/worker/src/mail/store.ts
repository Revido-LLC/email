/**
 * Mail persistence PORTS + shared value types.
 *
 * Consumers depend on these narrow interfaces (not the concrete Postgres store),
 * so their logic is unit-testable with in-memory fakes. `PgMailStore` (see
 * `./pg-store`) is the production implementation; all mailbox content it writes is
 * ciphertext under the account's DEK.
 */

import type {
  AgentRunStatus,
  DigestBundle,
  OutputLanguage,
  Priority,
  ReminderKind,
  Thread,
} from '@revido/db'
import type { AgentPlan, RawFetchedMessage, TriageResult } from '@revido/core'
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

// -- embeddings (RAG) --------------------------------------------------------

/** Decrypted text for embedding: subject + body, joined by the consumer. */
export interface MessageTextInput {
  subject: string
  text: string
}

export interface UpsertEmbeddingInput {
  userId: string
  messageId: string
  /** 1024-dim vector matching `message_embeddings.embedding`. */
  embedding: number[]
  model: string
}

export interface EmbedStore {
  getMessageText(
    userId: string,
    messageId: string,
    crypto: AccountCrypto,
  ): Promise<MessageTextInput | null>
  /** Idempotent upsert keyed on `message_id` (plaintext vector, by necessity). */
  upsertMessageEmbedding(input: UpsertEmbeddingInput): Promise<void>
}

// -- voice profile -----------------------------------------------------------

export interface SaveVoiceProfileInput {
  userId: string
  crypto: AccountCrypto
  profile: string
}

export interface VoiceStore {
  /** Decrypted bodies of the user's most recent SENT messages (newest first). */
  getSentBodies(userId: string, crypto: AccountCrypto, limit: number): Promise<string[]>
  saveVoiceProfile(input: SaveVoiceProfileInput): Promise<void>
}

// -- agents ------------------------------------------------------------------

/** A stored agent + its compiled plan (config is plaintext; reconstructed here). */
export interface StoredAgentPlan {
  name: string
  icon: string | null
  plan: AgentPlan
}

/** The safe (auto-run) thread mutations an agent can apply without approval. */
export type SafeThreadActionType = 'label' | 'archive' | 'star' | 'mark-read'

export interface ApplyThreadActionInput {
  userId: string
  threadId: string
  type: SafeThreadActionType
  /** Label to add for `label` (defaults handled by the caller). */
  label?: string
}

/** A consequential agent action queued for the user to approve. */
export interface EnqueueApprovalInput {
  userId: string
  agentId: string
  agentName: string
  agentIcon: string | null
  action: string
  threadId: string
  subject: string
  sender: string
  preview: string
  crypto: AccountCrypto
}

export interface RecordAgentRunInput {
  userId: string
  agentId: string
  agentName: string
  agentIcon: string | null
  at: Date
  status: AgentRunStatus
  summary: string
  reasoning: string
  affected: { threadId: string; subject: string; sender: string }[]
  reversible: boolean
  crypto: AccountCrypto
}

export interface ListAgentThreadsOptions {
  /** Restrict to these thread ids (new-mail trigger); omit for a recent sweep. */
  threadIds?: string[]
  /** Cap on threads scanned when `threadIds` is omitted. */
  limit?: number
}

export interface AgentStore {
  /** Rebuild an agent's plan from its stored (plaintext) config, or null. */
  getAgentPlan(userId: string, agentId: string): Promise<StoredAgentPlan | null>
  /** Load candidate threads as domain `Thread`s (subject decrypted) for matching. */
  listAgentThreads(
    userId: string,
    crypto: AccountCrypto,
    opts?: ListAgentThreadsOptions,
  ): Promise<Thread[]>
  applyThreadAction(input: ApplyThreadActionInput): Promise<void>
  enqueueApproval(input: EnqueueApprovalInput): Promise<void>
  recordAgentRun(input: RecordAgentRunInput): Promise<void>
}

// -- reminders / commitments -------------------------------------------------

export interface CreateReminderInput {
  userId: string
  kind: ReminderKind
  threadId: string
  subject: string
  context: string
  sender: string
  dueAt: Date
  draftReply?: string
  crypto: AccountCrypto
}

export interface CreateCommitmentInput {
  userId: string
  threadId: string
  subject: string
  text: string
  counterpart: string
  dueAt: Date
  crypto: AccountCrypto
}

export interface FollowUpStore {
  createReminder(input: CreateReminderInput): Promise<void>
  createCommitment(input: CreateCommitmentInput): Promise<void>
}

// -- chaser ------------------------------------------------------------------

/** Everything needed to send a pre-drafted follow-up for a reminder. */
export interface ChaserSendData {
  accountId: string
  to: Contact[]
  subject: string
  html: string
  text: string
  inReplyToProviderMessageId?: string
}

export interface ChaserStore {
  getChaserSendData(
    userId: string,
    reminderId: string,
    crypto: AccountCrypto,
  ): Promise<ChaserSendData | null>
  /** Resolve the reminder once its chaser has been sent. */
  deleteReminder(userId: string, reminderId: string): Promise<void>
}

// -- digest ------------------------------------------------------------------

export interface DigestData {
  email: string
  name: string | null
  outputLanguage: OutputLanguage
  bundles: DigestBundle[]
  reminders: { subject: string; sender: string; dueAt: string }[]
  commitments: { text: string; counterpart: string; dueAt: string }[]
  agentsHandled: number
}

export interface DigestStore {
  getDigestData(userId: string, crypto: AccountCrypto): Promise<DigestData>
}

/** The full mail store: every port a consumer might need. */
export interface MailStore
  extends SyncStore,
    TriageStore,
    UsageStore,
    EnrichStore,
    SendStore,
    EmbedStore,
    VoiceStore,
    AgentStore,
    FollowUpStore,
    ChaserStore,
    DigestStore {}
