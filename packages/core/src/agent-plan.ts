/**
 * Agent-plan schema (W8) — the compiled representation of a natural-language
 * inbox agent. `POST /agents/compile` (Opus 4.8, structured output) emits this;
 * `POST /agents/dry-run` and the tool-use execution loop consume it.
 *
 * Filled in by Wave 1 `core-domain` (zod schema + predicate compiler) and wired
 * to the runtime by the Wave 3 `agents-runtime` agent. This stub freezes the
 * shape so compile/dry-run/runtime agents agree on it.
 */

import { z } from 'zod'
import type { Thread } from '@revido/db'

/** Consequential actions are promoted to dedicated, gated tools (require approval). */
export const AGENT_ACTION_TYPES = [
  'label',
  'archive',
  'draft',
  'star',
  'mark-read',
  'send',
  'unsubscribe',
  'delete',
  'forward',
] as const
export type AgentActionType = (typeof AGENT_ACTION_TYPES)[number]

/** Actions the harness auto-runs vs. those it queues as approvals. */
export const CONSEQUENTIAL_ACTIONS: ReadonlySet<AgentActionType> = new Set([
  'send',
  'unsubscribe',
  'delete',
  'forward',
])

export const agentConditionSchema = z.object({
  field: z.string(),
  op: z.enum(['is', 'is-not', 'contains', 'not-contains', 'matches', 'gt', 'lt']),
  value: z.string(),
})
export type AgentCondition = z.infer<typeof agentConditionSchema>

export const agentActionSchema = z.object({
  type: z.enum(AGENT_ACTION_TYPES),
  label: z.string(),
  params: z.record(z.string()).optional(),
})
export type CompiledAgentAction = z.infer<typeof agentActionSchema>

export const agentPlanSchema = z.object({
  trigger: z.enum(['new-mail', 'scheduled']),
  schedule: z.string().optional(),
  conditions: z.array(agentConditionSchema),
  actions: z.array(agentActionSchema),
})
export type AgentPlan = z.infer<typeof agentPlanSchema>

// ---------------------------------------------------------------------------
// Predicate compiler
//
// Turns a plan's `conditions[]` into a `(thread) => boolean` predicate over
// `Thread`. This replaces the frontend's keyword-matcher mock and backs the
// server-side dry-run (`POST /agents/dry-run`) and the new-mail trigger check.
// Conditions are ANDed; an empty condition list matches every thread (a bare
// "new mail arrives" agent).
// ---------------------------------------------------------------------------

type FieldValues = { values: (string | number | boolean)[] } | null

/** Resolve a condition `field` to comparable value(s) on a thread. */
function resolveField(thread: Thread, field: string): FieldValues {
  switch (field.trim().toLowerCase()) {
    case 'category':
      return { values: [thread.category] }
    case 'subject':
      return { values: [thread.subject] }
    case 'priority':
      return { values: [thread.priority] }
    case 'priorityscore':
    case 'priority_score':
    case 'priority-score':
    case 'score':
      return { values: [thread.priorityScore] }
    case 'awaitingreply':
    case 'awaiting_reply':
    case 'awaiting-reply':
    case 'awaiting':
      return { values: [thread.awaitingReply] }
    case 'unread':
      return { values: [thread.unread] }
    case 'starred':
      return { values: [thread.starred] }
    case 'hasattachments':
    case 'has_attachments':
    case 'has-attachments':
    case 'attachments':
      return { values: [thread.hasAttachments] }
    case 'snoozed':
      return { values: [thread.snoozedUntil != null] }
    case 'label':
    case 'labels':
      return { values: thread.labels }
    case 'language':
    case 'lang':
      return { values: [thread.language ?? ''] }
    case 'from':
    case 'sender':
    case 'email':
    case 'participant':
    case 'participants':
      return { values: thread.participants.map((p) => p.email) }
    case 'name':
    case 'participantname':
    case 'participant_name':
      return { values: thread.participants.map((p) => p.name) }
    default:
      return null
  }
}

function parseBool(value: string): boolean {
  const v = value.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes' || v === 'y'
}

function equals(value: string | number | boolean, target: string): boolean {
  if (typeof value === 'number') return value === Number(target)
  if (typeof value === 'boolean') return value === parseBool(target)
  return value.toLowerCase() === target.trim().toLowerCase()
}

function asString(value: string | number | boolean): string {
  return typeof value === 'string' ? value : String(value)
}

function firstNumber(values: (string | number | boolean)[]): number | undefined {
  for (const v of values) {
    const n = typeof v === 'number' ? v : Number(v)
    if (!Number.isNaN(n)) return n
  }
  return undefined
}

/** Compile one condition into a thread predicate. */
function compileCondition(cond: AgentCondition): (t: Thread) => boolean {
  // Precompile the regex for `matches` once, not per-thread.
  let regex: RegExp | null = null
  if (cond.op === 'matches') {
    try {
      regex = new RegExp(cond.value, 'i')
    } catch {
      regex = null
    }
  }
  const target = cond.value

  return (thread: Thread) => {
    const resolved = resolveField(thread, cond.field)
    if (!resolved) return false // unknown field never matches
    const { values } = resolved
    switch (cond.op) {
      case 'is':
        return values.some((v) => equals(v, target))
      case 'is-not':
        return values.every((v) => !equals(v, target))
      case 'contains':
        return values.some((v) => asString(v).toLowerCase().includes(target.toLowerCase()))
      case 'not-contains':
        return values.every((v) => !asString(v).toLowerCase().includes(target.toLowerCase()))
      case 'matches':
        return regex != null && values.some((v) => regex!.test(asString(v)))
      case 'gt': {
        const n = firstNumber(values)
        return n != null && n > Number(target)
      }
      case 'lt': {
        const n = firstNumber(values)
        return n != null && n < Number(target)
      }
      default:
        return false
    }
  }
}

/**
 * Compile an agent plan's conditions into a `Thread` predicate. All conditions
 * must hold (AND); an empty condition list matches everything.
 */
export function compilePredicate(plan: AgentPlan): (t: Thread) => boolean {
  const checks = plan.conditions.map(compileCondition)
  if (checks.length === 0) return () => true
  return (thread: Thread) => checks.every((check) => check(thread))
}

/** Whether an action type must be queued for user approval (consequential). */
export function actionNeedsApproval(type: AgentActionType): boolean {
  return CONSEQUENTIAL_ACTIONS.has(type)
}

/** Whether a plan contains any consequential (approval-gated) action. */
export function planRequiresApproval(plan: AgentPlan): boolean {
  return plan.actions.some((a) => actionNeedsApproval(a.type))
}
