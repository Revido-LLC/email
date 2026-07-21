/**
 * `agent-run` consumer — execute an inbox agent's compiled plan as a gated
 * tool-use loop.
 *
 * The agent's plan (reconstructed from its plaintext config) gives `conditions`
 * and `actions`. `compilePredicate` selects the threads the agent applies to;
 * each plan action is treated as a TOOL invocation over each matched thread.
 * Tools split by consequence:
 *  - SAFE (label / archive / draft / star / mark-read) run immediately. `draft`
 *    calls the LLM to compose a reply; the rest mutate thread flags/labels.
 *  - CONSEQUENTIAL / `strict` (send / unsubscribe / delete / forward — see
 *    `CONSEQUENTIAL_ACTIONS`) never execute here: the loop instead writes an
 *    `approvals` row for the user to sign off, so the model can never take an
 *    irreversible action unattended.
 *
 * The loop is bounded by an iteration cap AND a cumulative token ceiling (draft
 * spend), records one `agent_runs` row (ciphertext summary/reasoning/affected),
 * and meters `agent_runs`. The shared `LlmClient` has no native tool surface, so
 * the "strict tool" gate is enforced structurally here rather than by the model.
 */

import {
  actionNeedsApproval,
  buildContentClassifierPrompt,
  buildDraftPrompt,
  compilePredicate,
  contentClauses,
  CONTENT_CLASSIFIER_SCHEMA,
  forwardDestination,
  type AgentCondition,
  type CompiledAgentAction,
  type LlmThinking,
} from '@revido/core'
import type { Message, Thread } from '@revido/db'
import type { UserContext } from '../db/accounts'
import type {
  AgentStore,
  SafeThreadActionType,
  ThreadForSummary,
  UsageStore,
} from '../mail/store'
import type { EnrichStore } from '../mail/store'
import type { WorkerLlmClient } from '../llm'
import type { JobStore } from '../queue/store'
import type { JobConsumer } from '../queue/runner'
import { agentRunPayload, QUEUE, type ForwardPayload } from '../queue/jobs'

/** Bounds so a runaway plan can't loop or spend without limit. */
const MAX_ITERATIONS = 50
const TOKEN_CEILING = 100_000
const DRAFT_MAX_TOKENS = 1024
const CLASSIFY_MAX_TOKENS = 64
/** Deferred/undo window for an auto-forward, mirroring the send path. */
const FORWARD_UNDO_MS = 10_000

export interface AgentRunDeps {
  loadUser(userId: string): Promise<UserContext>
  mail: Pick<
    AgentStore,
    'getAgentPlan' | 'listAgentThreads' | 'applyThreadAction' | 'enqueueApproval' | 'recordAgentRun'
  > &
    Pick<EnrichStore, 'getThread'> &
    Pick<UsageStore, 'increment'>
  llm: Pick<WorkerLlmClient, 'complete'>
  jobs: Pick<JobStore, 'enqueue'>
  now?(): Date
}

const SAFE_THREAD_ACTIONS = new Set<string>(['label', 'archive', 'star', 'mark-read'])

/** A participant display string for approval/affected metadata. */
function senderOf(thread: Thread): string {
  const p = thread.participants[0]
  if (!p) return ''
  return p.name ? `${p.name} <${p.email}>` : p.email
}

/** Adapt the decrypted summary shape into domain `Message[]` for the draft builder. */
function toMessages(threadId: string, thread: ThreadForSummary): Message[] {
  return thread.messages.map((m, i) => ({
    id: `${threadId}:${i}`,
    threadId,
    from: m.from,
    to: [],
    date: m.date,
    html: '',
    text: m.body,
    unread: false,
    outbound: m.outbound,
    attachments: [],
  }))
}

export function makeAgentRunConsumer(deps: AgentRunDeps): JobConsumer {
  const now = deps.now ?? ((): Date => new Date())
  return async (payload) => {
    const { userId, agentId, threadIds } = agentRunPayload.parse(payload)
    const user = await deps.loadUser(userId)

    const stored = await deps.mail.getAgentPlan(userId, agentId)
    if (!stored) return // agent was deleted between enqueue and run.
    const { plan, name: agentName, icon: agentIcon, trusted } = stored
    if (plan.actions.length === 0) return

    const threads = await deps.mail.listAgentThreads(userId, user.crypto, { threadIds })
    const predicate = compilePredicate(plan)
    const candidates = threads.filter(predicate)
    if (candidates.length === 0) return // nothing to act on; skip an empty run row.

    // Stage 2 (hybrid): a rule with `content` clauses only forwards a candidate the
    // AI classifier confirms. The paid check runs ONLY on candidates the cheap
    // structured predicate already passed, and is fail-closed (any error ⇒ drop).
    const clauses = contentClauses(plan)
    const matched: Thread[] = []
    for (const thread of candidates) {
      if (clauses.length === 0 || (await classifyThreadContent(deps, user, thread, clauses))) {
        matched.push(thread)
      }
    }
    if (matched.length === 0) return

    let iterations = 0
    let tokens = 0
    let approvals = 0
    let applied = 0
    const affected: { threadId: string; subject: string; sender: string }[] = []
    const reasoning: string[] = []

    outer: for (const thread of matched) {
      const sender = senderOf(thread)
      let touched = false
      for (const action of plan.actions) {
        if (iterations >= MAX_ITERATIONS || tokens >= TOKEN_CEILING) {
          reasoning.push('Stopped early: hit the run iteration/token ceiling.')
          break outer
        }
        iterations += 1

        if (action.type === 'forward') {
          const to = forwardDestination(action)
          const sourceMessageId = thread.messageIds.at(-1)
          if (!to || !sourceMessageId) {
            reasoning.push(`Skipped forward on "${thread.subject}": no valid destination.`)
            continue
          }
          if (trusted) {
            // Trusted rule → forward without approval, on the 10s deferred/undo window.
            const payload: ForwardPayload = {
              userId,
              accountId: thread.accountId,
              sourceMessageId,
              to,
            }
            await deps.jobs.enqueue(QUEUE.forward, payload, {
              runAt: new Date(now().getTime() + FORWARD_UNDO_MS),
            })
            applied += 1
            touched = true
            reasoning.push(`Auto-forwarded "${thread.subject}" to ${to}.`)
          } else {
            // Untrusted → queue for one-tap approval, carrying the destination + source.
            await deps.mail.enqueueApproval({
              userId,
              agentId,
              agentName,
              agentIcon,
              action: 'forward',
              threadId: thread.id,
              messageId: sourceMessageId,
              subject: thread.subject,
              sender,
              preview: action.label,
              params: { to },
              crypto: user.crypto,
            })
            approvals += 1
            touched = true
            reasoning.push(`Queued forward of "${thread.subject}" to ${to} for approval.`)
          }
          continue
        }

        if (actionNeedsApproval(action.type)) {
          // strict tool → queue for human approval instead of executing.
          await deps.mail.enqueueApproval({
            userId,
            agentId,
            agentName,
            agentIcon,
            action: action.type,
            threadId: thread.id,
            subject: thread.subject,
            sender,
            preview: action.label,
            crypto: user.crypto,
          })
          approvals += 1
          touched = true
          reasoning.push(`Queued "${action.type}" on "${thread.subject}" for approval.`)
          continue
        }

        if (action.type === 'draft') {
          tokens += await draftReply(deps, user, thread)
          applied += 1
          touched = true
          reasoning.push(`Drafted a reply for "${thread.subject}".`)
          continue
        }

        if (SAFE_THREAD_ACTIONS.has(action.type)) {
          await deps.mail.applyThreadAction({
            userId,
            threadId: thread.id,
            type: action.type as SafeThreadActionType,
            label: labelFor(action),
          })
          applied += 1
          touched = true
          reasoning.push(`Applied "${action.type}" to "${thread.subject}".`)
        }
      }
      if (touched) affected.push({ threadId: thread.id, subject: thread.subject, sender })
    }

    const status = approvals > 0 ? 'pending-approval' : 'done'
    const summary =
      `${agentName}: ${applied} action(s) applied across ${affected.length} thread(s)` +
      (approvals > 0 ? `, ${approvals} awaiting approval.` : '.')

    await deps.mail.recordAgentRun({
      userId,
      agentId,
      agentName,
      agentIcon,
      at: now(),
      status,
      summary,
      reasoning: reasoning.join('\n'),
      affected,
      reversible: approvals === 0,
      crypto: user.crypto,
    })
    await deps.mail.increment(userId, 'agent_runs')
  }
}

/** The literal label to apply for a `label` action (structured param preferred). */
function labelFor(action: CompiledAgentAction): string {
  return action.params?.label ?? action.params?.value ?? action.label
}

/**
 * Stage-2 content check: does the thread satisfy EVERY content clause? Loads the
 * decrypted body text once and asks the classifier per clause. Fail-closed — any
 * missing text, LLM error, or non-boolean result counts as no match, so an
 * uncertain classification never auto-forwards private mail.
 */
async function classifyThreadContent(
  deps: AgentRunDeps,
  user: UserContext,
  thread: Thread,
  clauses: AgentCondition[],
): Promise<boolean> {
  try {
    const full = await deps.mail.getThread(user.userId, thread.id, user.crypto)
    if (!full || full.messages.length === 0) return false
    const text = [full.subject, ...full.messages.map((m) => m.body)].join('\n\n').trim()
    if (!text) return false
    for (const clause of clauses) {
      const prompt = buildContentClassifierPrompt(text, clause.value)
      const result = await deps.llm.complete({
        model: 'triage',
        system: prompt.system,
        messages: prompt.messages,
        maxTokens: CLASSIFY_MAX_TOKENS,
        responseFormat: { type: 'json', schema: CONTENT_CLASSIFIER_SCHEMA },
        userId: user.userId,
      })
      await deps.mail.increment(user.userId, 'ai_enrichments')
      const match = (result.json as { match?: unknown } | undefined)?.match
      if (match !== true) return false
    }
    return true
  } catch {
    return false // fail-closed
  }
}

/** Compose a reply draft via the LLM. Returns the token spend to charge the ceiling. */
async function draftReply(
  deps: AgentRunDeps,
  user: UserContext,
  thread: Thread,
): Promise<number> {
  const full = await deps.mail.getThread(user.userId, thread.id, user.crypto)
  if (!full || full.messages.length === 0) return 0
  const prompt = buildDraftPrompt(thread, toMessages(thread.id, full), {
    outputLanguage: full.outputLanguage,
    detectedLanguage: full.detectedLanguage ?? undefined,
  })
  const thinking: LlmThinking = { type: 'disabled' }
  const result = await deps.llm.complete({
    model: 'summary',
    system: prompt.system,
    messages: prompt.messages,
    maxTokens: DRAFT_MAX_TOKENS,
    thinking,
    userId: user.userId,
  })
  await deps.mail.increment(user.userId, 'ai_enrichments')
  return result.usage.inputTokens + result.usage.outputTokens
}
