/**
 * Types for the mock mailbox. These deliberately mirror the shape of the
 * *future* API so that swapping mock data for real endpoints is a data-layer
 * change, not a UI rewrite. All ids are opaque strings; all timestamps are ISO
 * 8601 strings (`new Date().toISOString()` shape).
 */

export type Provider = 'gmail' | 'outlook'

/** The 9 triage categories. The first 8 carry the locked category color system. */
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

export interface CategoryMeta {
  id: CategoryId
  label: string
  /** Tailwind token stem, e.g. `newsletters` → `bg-cat-newsletters` / `text-cat-newsletters`. */
  token: string
  /** lucide-react icon name, resolved by the UI layer. */
  icon: string
  /** Search synonyms surfaced in the command palette (⌘K). */
  keywords?: string[]
}

export type Priority = 'urgent' | 'high' | 'normal' | 'low'

export interface Contact {
  name: string
  email: string
  /** Optional avatar image; when absent the UI renders initials. */
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

/** A structured fact pulled out of a thread by the extraction pipeline. */
export type ExtractedFactType = 'date' | 'amount' | 'tracking' | 'link' | 'action' | 'contact'
export interface ExtractedFact {
  type: ExtractedFactType
  label: string
  value: string
  /** For `action` facts: whether the user has checked it off. */
  done?: boolean
  /** For `link`/`tracking`: the href. */
  href?: string
}

/** Compact badges rendered inline on a thread row. */
export interface ThreadBadge {
  kind: 'attachment' | 'amount' | 'date' | 'tracking' | 'people'
  label: string
}

export interface Attachment {
  id: string
  name: string
  /** Human-readable size, e.g. "1.2 MB". */
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
  /** Sanitized HTML body (already safe to render in a sandboxed iframe). */
  html: string
  /** Plain-text fallback / preview snippet. */
  text: string
  unread: boolean
  outbound: boolean
  attachments: Attachment[]
  /** Whether this message contained remote images that the proxy blocked. */
  imagesBlocked?: boolean
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
  /** One-line AI summary shown in the thread list, replacing the raw snippet. */
  tldr: string
  /** 2–3 sentence pinned summary for the takeover view. */
  summary: string
  unread: boolean
  starred: boolean
  /** ISO timestamp if snoozed, else null. */
  snoozedUntil: string | null
  hasAttachments: boolean
  badges: ThreadBadge[]
  extracted: ExtractedFact[]
  messageIds: string[]
  lastMessageAt: string
  /** True when this is a sent thread awaiting a reply (feeds follow-up reminders). */
  awaitingReply: boolean
  labels: string[]
}

// ---------- Agents ----------

export interface AgentAction {
  /** e.g. "label", "archive", "draft", "unsubscribe", "send", "delete". */
  type: string
  label: string
  /** Consequential actions require approval before they run. */
  needsApproval: boolean
}

export interface AgentDef {
  id: string
  name: string
  /** Short human description of what the agent does. */
  description: string
  /** lucide-react icon name. */
  icon: string
  enabled: boolean
  /** e.g. "New mail arrives", "Nightly at 9pm". */
  trigger: string
  conditions: string[]
  actions: AgentAction[]
  /** How many emails this agent has touched to date. */
  runCount: number
  affectedCount: number
  /** For gallery cards not yet enabled by the user. */
  prebuilt: boolean
  /** Category color token stem for the card accent. */
  accent: string
}

export type AgentRunStatus = 'done' | 'pending-approval' | 'reversed'
export interface AgentRunEntry {
  id: string
  agentId: string
  agentName: string
  agentIcon: string
  at: string
  /** One-line summary of the action taken. */
  summary: string
  /** The agent's stated reasoning, revealed on expand. */
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
  /** Preview of the consequential action (e.g. the draft body to be sent). */
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
  /** Why this reminder exists ("Sent 4 days ago, no reply"). */
  context: string
  sender: string
  dueAt: string
  /** For follow-ups: a pre-drafted chaser, one click to send. */
  draftReply?: string
}

/** A promise the user made, detected from sent mail ("I'll get back to you Friday"). */
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
  needsYou: string[] // thread ids
  commitments: string[] // commitment ids
  agentReport: string[] // agent run entry ids
  canIgnore: DigestBundle[]
  /** Rotating Revido CTA line for the footer. */
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
  /** The number that makes the proposal concrete ("34 newsletters"). */
  metric: string
}

export interface Signature {
  id: string
  accountId: string
  name: string
  html: string
}
