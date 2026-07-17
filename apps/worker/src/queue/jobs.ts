/**
 * Job queue contract — the CROSS-AGENT boundary between api-service and worker.
 *
 * The `jobs` table (see `@revido/db/schema` → `jobs`) is a plaintext work queue:
 * `{ queue, payload (jsonb), run_at, attempts, max_attempts, locked_at,
 * locked_by, status: pending|done|failed, last_error }`. Payloads carry NO
 * mailbox content — only ids the worker resolves against the (encrypted) db.
 *
 * PRODUCERS:
 *  - api-service enqueues `backfill`, `incremental`, and `send`.
 *  - the worker's node-cron scheduler enqueues `renew_watch`, `reconcile`, and
 *    `digest`; sync consumers enqueue `triage` (and `summary` for new threads).
 *
 * PAYLOAD SCHEMAS (the minimal, agreed shapes — keep in sync with api-service):
 *  - backfill    : { accountId }                 progressive newest-first import
 *  - incremental : { accountId, cursor? }         push-notified delta apply
 *  - send        : { accountId, messageId }        deferred send (runAt = +10s)
 *  - triage      : { accountId, threadId, messageId }
 *  - summary     : { accountId, threadId }         summary + extraction (+escalation)
 *  - renew_watch : { accountId }                   Gmail watch / Graph subscription
 *  - reconcile   : { accountId }                   missed-push safety-net sweep
 *  - digest      : { userId }                       daily digest generation
 *
 * `cursor` on `incremental` is an override; when omitted the worker reads the
 * persisted cursor from `sync_state`. Cancellation of a deferred `send` is
 * api-service DELETEing the still-`pending` row before `run_at`.
 */

import { z } from 'zod'

export const QUEUE = {
  backfill: 'backfill',
  incremental: 'incremental',
  send: 'send',
  triage: 'triage',
  summary: 'summary',
  renewWatch: 'renew_watch',
  reconcile: 'reconcile',
  digest: 'digest',
} as const

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE]

export const backfillPayload = z.object({ accountId: z.string().uuid() })
export const incrementalPayload = z.object({
  accountId: z.string().uuid(),
  cursor: z.string().optional(),
})
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
export const renewWatchPayload = z.object({ accountId: z.string().uuid() })
export const reconcilePayload = z.object({ accountId: z.string().uuid() })
export const digestPayload = z.object({ userId: z.string().uuid() })

export type BackfillPayload = z.infer<typeof backfillPayload>
export type IncrementalPayload = z.infer<typeof incrementalPayload>
export type SendPayload = z.infer<typeof sendPayload>
export type TriagePayload = z.infer<typeof triagePayload>
export type SummaryPayload = z.infer<typeof summaryPayload>
export type RenewWatchPayload = z.infer<typeof renewWatchPayload>
export type ReconcilePayload = z.infer<typeof reconcilePayload>
export type DigestPayload = z.infer<typeof digestPayload>
