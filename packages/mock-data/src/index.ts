export * from './types'
export * from './categories'
export * from './data'

import {
  ACCOUNTS,
  AGENT_RUNS,
  AGENTS,
  APPROVALS,
  COMMITMENTS,
  MESSAGES,
  REMINDERS,
  THREADS,
} from './data'
import type { AgentDef, AgentRunEntry, CategoryId, Message, Thread } from './types'

// ---------- Getter helpers (mirror future API endpoints) ----------

export function getThread(id: string): Thread | undefined {
  return THREADS.find((t) => t.id === id)
}

export function getMessages(threadId: string): Message[] {
  const thread = getThread(threadId)
  if (!thread) return []
  return thread.messageIds
    .map((mid) => MESSAGES.find((m) => m.id === mid))
    .filter((m): m is Message => Boolean(m))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function getThreadsByCategory(category: CategoryId): Thread[] {
  return THREADS.filter((t) => t.category === category).sort(byPriority)
}

/** The Focused Inbox: threads that need the user, sorted by priority score. */
export function getNeedsYou(): Thread[] {
  return THREADS.filter((t) => t.category === 'to-reply' || t.priorityScore >= 70).sort(byPriority)
}

/** Threads sorted newest-first (raw recency), for the "all mail" style views. */
export function getInboxByRecency(): Thread[] {
  return [...THREADS].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
}

export function getUnreadCount(category: CategoryId): number {
  return THREADS.filter((t) => t.category === category && t.unread).length
}

export function getCategoryCounts(): Record<CategoryId, number> {
  const counts = {} as Record<CategoryId, number>
  for (const t of THREADS) counts[t.category] = (counts[t.category] ?? 0) + 1
  return counts
}

export function getAgent(id: string): AgentDef | undefined {
  return AGENTS.find((a) => a.id === id)
}

export function getEnabledAgents(): AgentDef[] {
  return AGENTS.filter((a) => a.enabled)
}

export function getAgentRuns(agentId?: string): AgentRunEntry[] {
  const runs = agentId ? AGENT_RUNS.filter((r) => r.agentId === agentId) : AGENT_RUNS
  return [...runs].sort((a, b) => b.at.localeCompare(a.at))
}

export function getPendingApprovalCount(): number {
  return APPROVALS.length
}

export function getAccount(id: string) {
  return ACCOUNTS.find((a) => a.id === id)
}

export function getReminders() {
  return REMINDERS
}

export function getCommitments() {
  return COMMITMENTS
}

function byPriority(a: Thread, b: Thread): number {
  return b.priorityScore - a.priorityScore
}

/** Simulated dry-run: how many past threads an agent-like rule would have matched. */
export function dryRunMatch(predicate: (t: Thread) => boolean): Thread[] {
  return THREADS.filter(predicate)
}
