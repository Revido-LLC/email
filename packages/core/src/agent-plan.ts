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
