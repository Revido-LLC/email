/**
 * Centralized React Query keys + shared invalidation helpers.
 *
 * One place owns the shape of every cache key so reads and the writes that
 * invalidate them can't drift. Keys are `as const` tuples; list keys sit at a
 * short prefix (e.g. `['threads']`) so a single `invalidateQueries` sweeps every
 * derived list, detail, and count under it.
 */
import type { QueryClient } from '@tanstack/react-query'

export const queryKeys = {
  me: () => ['me'] as const,
  today: () => ['today'] as const,
  usage: () => ['usage'] as const,
  aiPreferences: () => ['settings', 'ai'] as const,
  appearance: () => ['settings', 'appearance'] as const,
  threads: {
    all: () => ['threads'] as const,
    detail: (id: string) => ['threads', 'detail', id] as const,
    messages: (threadId: string) => ['threads', 'messages', threadId] as const,
    needsYou: () => ['threads', 'needs-you'] as const,
    byRecency: () => ['threads', 'recent'] as const,
    byCategory: (categoryId: string) => ['threads', 'category', categoryId] as const,
  },
  categories: {
    counts: () => ['categories', 'counts'] as const,
    unreadCount: (categoryId: string) => ['categories', 'unread-count', categoryId] as const,
  },
  agents: {
    all: () => ['agents'] as const,
    enabled: () => ['agents', 'enabled'] as const,
    detail: (id: string) => ['agents', 'detail', id] as const,
  },
  agentRuns: {
    all: () => ['agent-runs'] as const,
    list: (agentId?: string) => ['agent-runs', agentId ?? 'all'] as const,
  },
  approvals: {
    all: () => ['approvals'] as const,
    count: () => ['approvals', 'count'] as const,
  },
  reminders: () => ['reminders'] as const,
  commitments: () => ['commitments'] as const,
  accounts: {
    all: () => ['accounts'] as const,
    detail: (id: string) => ['accounts', 'detail', id] as const,
  },
  signatures: () => ['signatures'] as const,
  onboarding: {
    scan: () => ['onboarding', 'scan'] as const,
    agentProposals: () => ['onboarding', 'agent-proposals'] as const,
  },
} as const

/**
 * Any thread-changing write ripples into the inbox lists (needs-you, by-category,
 * recency, detail) and the nav-rail category counts.
 */
export function invalidateThreadCaches(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: queryKeys.threads.all() })
  void qc.invalidateQueries({ queryKey: queryKeys.categories.counts() })
}

/** Agent create/toggle/delete changes the gallery and enabled list. */
export function invalidateAgentCaches(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: queryKeys.agents.all() })
}

/** Approve/reject changes the queue and the nav-rail pending badge. */
export function invalidateApprovalCaches(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: queryKeys.approvals.all() })
}
