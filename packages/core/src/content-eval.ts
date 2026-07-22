/**
 * Shared content-evaluation planner — the single partitioning step both the
 * server dry-run and the worker run so the preview can never diverge from
 * runtime. Applies the metadata predicate, then the free pre-filter over any
 * `content` clauses, splitting candidates into: `autoMatched` (no content clause
 * — metadata alone decides), `needsAi` (passed metadata + pre-filter, still need
 * the paid classifier), and `excluded` (hard-dropped by the pre-filter). Pure:
 * the LLM lives in the caller.
 */
import type { Thread } from '@revido/db'
import { compilePredicate, contentClauses, type AgentPlan } from './agent-plan'
import { detectDocType, prefilterVerdict } from './content-prefilter'

export interface ExcludedThread {
  thread: Thread
  reason: string
}

export interface ContentEvaluation {
  autoMatched: Thread[]
  needsAi: Thread[]
  excluded: ExcludedThread[]
}

const EXCLUDE_REASON = 'Billing/past-due notice — not the document requested'

export function planContentEvaluation(plan: AgentPlan, threads: Thread[]): ContentEvaluation {
  const predicate = compilePredicate(plan)
  const candidates = threads.filter(predicate)
  const clauses = contentClauses(plan)
  if (clauses.length === 0) {
    return { autoMatched: candidates, needsAi: [], excluded: [] }
  }
  const docTypes = clauses.map((c) => detectDocType(c.value))
  const autoMatched: Thread[] = []
  const needsAi: Thread[] = []
  const excluded: ExcludedThread[] = []
  for (const thread of candidates) {
    const signals = { subject: thread.subject, snippet: thread.tldr }
    const drop = docTypes.some((dt) => prefilterVerdict(signals, dt) === 'exclude')
    if (drop) excluded.push({ thread, reason: EXCLUDE_REASON })
    else needsAi.push(thread)
  }
  return { autoMatched, needsAi, excluded }
}
