/**
 * Demo mode — the "See it live" experience.
 *
 * The shell is marketed as "explore the demo, no signup", but every screen reads
 * from the real API, so a signed-in visitor would see their REAL inbox under a
 * demo banner (and a signed-out one just bounces to the landing). That's wrong:
 * a product demo must show synthetic seed data and never touch a real mailbox.
 *
 * When demo mode is on (the `/app?demo` entry sets it), `apiFetch`/`apiStream`
 * short-circuit to `@revido/mock-data` — the synthetic seed inbox — instead of
 * the network. No auth, no real mail, no writes. The flag is sticky for the SPA
 * session so in-app navigation stays in the demo; a full reload (e.g. after real
 * sign-in) clears it.
 */
import {
  ACCOUNTS,
  AGENTS,
  APPROVALS,
  SIGNATURES,
  TODAY_BRIEF,
  USER,
  getAccount,
  getAgent,
  getAgentRuns,
  getCategoryCounts,
  getCommitments,
  getEnabledAgents,
  getInboxByRecency,
  getMessages,
  getNeedsYou,
  getPendingApprovalCount,
  getReminders,
  getThread,
  getThreadsByCategory,
  getUnreadCount,
  type CategoryId,
} from '@revido/mock-data'

let DEMO = false

/** Turn demo mode on. Sticky for the session; a full page reload resets it. */
export function enableDemo(): void {
  DEMO = true
}

export function isDemo(): boolean {
  return DEMO
}

const decode = (seg: string): string => {
  try {
    return decodeURIComponent(seg)
  } catch {
    return seg
  }
}

/**
 * Resolve a demo API call to seed data. GETs map to the mock selectors; writes
 * are accepted no-ops (the demo never persists). Unknown routes return an empty
 * value shaped to not crash a consumer (`[]`), since every real screen route is
 * mapped explicitly below.
 */
export function resolveDemo(path: string, method: string): unknown {
  const [rawPath, rawQuery] = path.split('?')
  const p = rawPath ?? path
  const query = rawQuery ?? ''
  const seg = p.split('/').filter(Boolean) // e.g. ['threads','t-1','messages']

  if (method !== 'GET') return demoWrite(p)

  // Exact routes.
  switch (p) {
    case '/me':
      return USER
    case '/today':
      return TODAY_BRIEF
    case '/accounts':
      return ACCOUNTS
    case '/threads/needs-you':
      return getNeedsYou()
    case '/threads':
      return getInboxByRecency()
    case '/categories/counts':
      return getCategoryCounts()
    case '/agents':
      return query.includes('enabled=true') ? getEnabledAgents() : AGENTS
    case '/agent-runs':
      return getAgentRuns()
    case '/approvals':
      return APPROVALS
    case '/approvals/count':
      return getPendingApprovalCount()
    case '/reminders':
      return getReminders()
    case '/commitments':
      return getCommitments()
    case '/signatures':
      return SIGNATURES
    case '/settings/ai':
      return { outputLanguage: 'match', detectedLanguage: 'en' }
    case '/settings/appearance':
      return { appearance: 'system' }
    case '/usage':
      return { chatQueries: 3, aiDrafts: 5, agentRuns: 12 }
  }

  // Pattern routes: /threads/:id, /threads/:id/messages, /categories/:id/*, /accounts/:id, /agents/:id.
  if (seg[0] === 'threads' && seg[1]) {
    const id = decode(seg[1])
    return seg[2] === 'messages' ? getMessages(id) : (getThread(id) ?? null)
  }
  if (seg[0] === 'categories' && seg[1]) {
    const cat = decode(seg[1]) as CategoryId
    if (seg[2] === 'unread-count') return getUnreadCount(cat)
    if (seg[2] === 'threads') return getThreadsByCategory(cat)
  }
  if (seg[0] === 'accounts' && seg[1]) return getAccount(decode(seg[1])) ?? ACCOUNTS[0]
  if (seg[0] === 'agents' && seg[1]) return getAgent(decode(seg[1])) ?? null

  return []
}

/** A write in demo mode "succeeds" without persisting; shape is permissive. */
function demoWrite(path: string): unknown {
  if (path.endsWith('/approve')) return { resolved: 'approved' }
  if (path.endsWith('/reject')) return { resolved: 'rejected' }
  if (path.endsWith('/send-chaser')) return { sent: true }
  return { ok: true }
}

/** A canned assistant answer for the demo chat stream (no LLM, no network). */
export const DEMO_CHAT_ANSWER =
  'This is a live demo running on sample data. Ask about the sample inbox — e.g. “what needs a reply?” — and sign in to use it on your own mailbox.'
