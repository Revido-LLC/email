/**
 * Domain types — the canonical shape of Revido Mail's data.
 *
 * These moved here from `@revido/mock-data` (now demoted to seed/fixtures): the
 * DB package is the source of truth for the API contract. During the mock→real
 * migration these mirror `packages/mock-data/src/types.ts` exactly; the Wave 1
 * `db-schema` agent replaces the hand-written interfaces below with types
 * inferred from the Drizzle schema (`$inferSelect`) while keeping every name and
 * field identical, so no downstream import changes.
 *
 * All ids are opaque strings; all timestamps are ISO 8601 strings.
 */

export type Provider = 'gmail' | 'outlook'

/** The 9 locked triage categories. The first 8 carry the category color system. */
export type CategoryId =
  | 'to-reply'
  | 'awaiting-reply'
  | 'fyi'
  | 'newsletters'
  | 'notifications'
  | 'promotions'
  | 'receipts'
  | 'calendar'
  | 'personal'

/** Output-language preference for AI artifacts (W5). */
export type OutputLanguage = 'match' | 'en' | 'nl'

/** Detected content language for a thread/message (W2 `language` column). */
export type LanguageCode = 'en' | 'nl' | (string & {})

export interface CategoryMeta {
  id: CategoryId
  label: string
  token: string
  icon: string
  keywords?: string[]
}

export type Priority = 'urgent' | 'high' | 'normal' | 'low'

export interface Contact {
  name: string
  email: string
  avatarUrl?: string
}

export interface Account {
  id: string
  provider: Provider
  email: string
  name: string
  avatarUrl?: string
  /** Backfill progress 0–1; 1 = fully synced. */
  syncProgress: number
  syncLabel: string
}

export type ExtractedFactType = 'date' | 'amount' | 'tracking' | 'link' | 'action' | 'contact'
export interface ExtractedFact {
  type: ExtractedFactType
  label: string
  value: string
  done?: boolean
  href?: string
}

export interface ThreadBadge {
  kind: 'attachment' | 'amount' | 'date' | 'tracking' | 'people'
  label: string
}

export interface Attachment {
  id: string
  name: string
  size: string
  mime: string
  kind: 'pdf' | 'image' | 'doc' | 'sheet' | 'zip' | 'other'
}

export interface Message {
  id: string
  threadId: string
  from: Contact
  to: Contact[]
  cc?: Contact[]
  date: string
  /** Sanitized HTML body (safe to render in a sandboxed iframe). */
  html: string
  text: string
  unread: boolean
  outbound: boolean
  attachments: Attachment[]
  imagesBlocked?: boolean
  /** Detected content language (set by triage). */
  language?: LanguageCode
}

export interface Thread {
  id: string
  accountId: string
  subject: string
  participants: Contact[]
  category: CategoryId
  priority: Priority
  /** 0–100; drives the Focused Inbox sort. */
  priorityScore: number
  tldr: string
  summary: string
  unread: boolean
  starred: boolean
  snoozedUntil: string | null
  hasAttachments: boolean
  badges: ThreadBadge[]
  extracted: ExtractedFact[]
  messageIds: string[]
  lastMessageAt: string
  awaitingReply: boolean
  labels: string[]
  /** Detected content language (set by triage). */
  language?: LanguageCode
}

// ---------- Agents ----------

export interface AgentAction {
  type: string
  label: string
  needsApproval: boolean
}

export interface AgentDef {
  id: string
  name: string
  description: string
  icon: string
  enabled: boolean
  trigger: string
  conditions: string[]
  actions: AgentAction[]
  runCount: number
  affectedCount: number
  prebuilt: boolean
  accent: string
}

export type AgentRunStatus = 'done' | 'pending-approval' | 'reversed'
export interface AgentRunEntry {
  id: string
  agentId: string
  agentName: string
  agentIcon: string
  at: string
  summary: string
  reasoning: string
  affected: { threadId: string; subject: string; sender: string }[]
  status: AgentRunStatus
  reversible: boolean
}

export interface Approval {
  id: string
  agentId: string
  agentName: string
  agentIcon: string
  action: string
  threadId: string
  subject: string
  sender: string
  preview: string
  createdAt: string
}

// ---------- Reminders / commitments ----------

export type ReminderKind = 'follow-up' | 'deadline' | 'snoozed'
export interface Reminder {
  id: string
  kind: ReminderKind
  threadId: string
  subject: string
  context: string
  sender: string
  dueAt: string
  draftReply?: string
}

export interface Commitment {
  id: string
  text: string
  threadId: string
  subject: string
  counterpart: string
  dueAt: string
}

// ---------- Digest / Today ----------

export interface DigestBundle {
  category: CategoryId
  count: number
  items: { subject: string; sender: string }[]
}

export interface TodayBrief {
  greeting: string
  date: string
  stats: { needYou: number; promises: number; agentsHandled: number }
  needsYou: string[]
  commitments: string[]
  agentReport: string[]
  canIgnore: DigestBundle[]
  revidoCta: string
}

export interface OnboardingScanResult {
  totalThreads: number
  needReplies: number
  newsletters: number
  invoices: number
  awaitingReply: number
  proposals: AgentProposal[]
}

export interface AgentProposal {
  id: string
  title: string
  detail: string
  icon: string
  accent: string
  metric: string
}

export interface Signature {
  id: string
  accountId: string
  name: string
  html: string
}
