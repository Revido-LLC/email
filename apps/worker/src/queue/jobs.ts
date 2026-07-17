/**
 * Job queue contract — the CROSS-AGENT boundary between api-service and worker.
 *
 * The `jobs` table (see `@revido/db/schema` → `jobs`) is a plaintext work queue:
 * `{ queue, payload (jsonb), run_at, attempts, max_attempts, locked_at,
 * locked_by, status: pending|done|failed, last_error }`. Payloads carry NO
 * mailbox content — only ids the worker resolves against the (encrypted) db.
 *
 * PRODUCERS:
 *  - api-service enqueues `backfill`, `incremental`, and `send`; it also enqueues
 *    `chaser` (user confirms a follow-up).
 *  - the worker's node-cron scheduler enqueues `renew_watch`, `reconcile`,
 *    `digest`, `voice_profile` (per user), and `agent_run` (scheduled sweep);
 *    sync consumers enqueue `triage` + `embed` (and `summary` for new threads), and
 *    the incremental consumer enqueues `agent_run` (new-mail trigger) per enabled
 *    new-mail agent for each thread that gained inbound mail.
 *
 * PAYLOAD SCHEMAS (the minimal, agreed shapes — keep in sync with api-service):
 *  - backfill      : { accountId }                 progressive newest-first import
 *  - incremental   : one of three shapes (see `incrementalPayload`):
 *      • { accountId, cursor? }                     reconcile sweep / internal re-enqueue
 *      • { provider:'gmail', emailAddress, historyId }              Gmail Pub/Sub push
 *      • { provider:'outlook', subscriptionId, resource, changeType, tenantId? }  Graph push
 *    The provider-push shapes carry NO account id (the webhook has no session), so
 *    the worker resolves the account service-side — Gmail by address, Outlook by the
 *    persisted watch subscription id — before applying the delta.
 *  - send          : { accountId, messageId }        deferred send (runAt = +10s)
 *  - triage        : { accountId, threadId, messageId }
 *  - summary       : { accountId, threadId }         summary + extraction (+escalation)
 *  - embed         : { accountId, messageId }        embed body → pgvector (RAG)
 *  - voice_profile : { userId }                      learn the user's writing voice
 *  - agent_run     : { userId, agentId, threadIds? } run an inbox agent's plan
 *  - chaser        : { userId, reminderId }          send a pre-drafted follow-up
 *  - renew_watch   : { accountId }                   Gmail watch / Graph subscription
 *  - reconcile     : { accountId }                   missed-push safety-net sweep
 *  - digest        : { userId }                       daily digest generation
 *
 * Payloads carry NO mailbox content — only ids (and, for `agent_run`, the
 * plaintext-config agent id) the worker resolves against the encrypted db.
 * `cursor` on `incremental` is an override; when omitted the worker reads the
 * persisted cursor from `sync_state`. `threadIds` on `agent_run` scopes the run
 * to just-arrived threads (new-mail trigger); omit it for a full sweep.
 * Cancellation of a deferred `send` is api-service DELETEing the still-`pending`
 * row before `run_at`.
 */

import { z } from 'zod'

export const QUEUE = {
  backfill: 'backfill',
  incremental: 'incremental',
  send: 'send',
  triage: 'triage',
  summary: 'summary',
  embed: 'embed',
  voiceProfile: 'voice_profile',
  agentRun: 'agent_run',
  chaser: 'chaser',
  renewWatch: 'renew_watch',
  reconcile: 'reconcile',
  digest: 'digest',
} as const

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE]

export const backfillPayload = z.object({ accountId: z.string().uuid() })

/** Reconcile sweep / internal re-enqueue: the account is already known. */
export const incrementalByAccountPayload = z.object({
  accountId: z.string().uuid(),
  cursor: z.string().optional(),
})
/** Gmail Pub/Sub push envelope (no account id — resolved by mailbox address). */
export const incrementalGmailPushPayload = z.object({
  provider: z.literal('gmail'),
  emailAddress: z.string().min(1),
  historyId: z.string().min(1),
})
/** Microsoft Graph change notification (resolved by persisted subscription id). */
export const incrementalOutlookPushPayload = z.object({
  provider: z.literal('outlook'),
  subscriptionId: z.string().min(1),
  resource: z.string().min(1),
  changeType: z.string().min(1),
  tenantId: z.string().optional(),
})
/**
 * The `incremental` queue accepts BOTH the internal `{ accountId }` shape (reconcile
 * sweep) AND the raw provider-push shapes the api-service webhooks enqueue. The
 * consumer resolves an account id from whichever arrives before running the sync.
 */
export const incrementalPayload = z.union([
  incrementalByAccountPayload,
  incrementalGmailPushPayload,
  incrementalOutlookPushPayload,
])
export const sendPayload = z.object({
  accountId: z.string().uuid(),
  messageId: z.string().uuid(),
})
export const triagePayload = z.object({
  accountId: z.string().uuid(),
  threadId: z.string().uuid(),
  messageId: z.string().uuid(),
})
export const summaryPayload = z.object({
  accountId: z.string().uuid(),
  threadId: z.string().uuid(),
})
export const embedPayload = z.object({
  accountId: z.string().uuid(),
  messageId: z.string().uuid(),
})
export const voiceProfilePayload = z.object({ userId: z.string().uuid() })
export const agentRunPayload = z.object({
  userId: z.string().uuid(),
  agentId: z.string().uuid(),
  /** Scope to just-arrived threads (new-mail trigger); omit for a full sweep. */
  threadIds: z.array(z.string().uuid()).optional(),
})
export const chaserPayload = z.object({
  userId: z.string().uuid(),
  reminderId: z.string().uuid(),
})
export const renewWatchPayload = z.object({ accountId: z.string().uuid() })
export const reconcilePayload = z.object({ accountId: z.string().uuid() })
export const digestPayload = z.object({ userId: z.string().uuid() })

export type BackfillPayload = z.infer<typeof backfillPayload>
export type IncrementalPayload = z.infer<typeof incrementalPayload>
export type SendPayload = z.infer<typeof sendPayload>
export type TriagePayload = z.infer<typeof triagePayload>
export type SummaryPayload = z.infer<typeof summaryPayload>
export type EmbedPayload = z.infer<typeof embedPayload>
export type VoiceProfilePayload = z.infer<typeof voiceProfilePayload>
export type AgentRunPayload = z.infer<typeof agentRunPayload>
export type ChaserPayload = z.infer<typeof chaserPayload>
export type RenewWatchPayload = z.infer<typeof renewWatchPayload>
export type ReconcilePayload = z.infer<typeof reconcilePayload>
export type DigestPayload = z.infer<typeof digestPayload>
