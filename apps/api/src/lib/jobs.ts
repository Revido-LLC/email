/**
 * Enqueue helpers for the `jobs` table — the contract between api and worker.
 *
 * The `jobs` queue is service-accessed (owner role, no `app_user` grant), so every
 * enqueue runs via `asService`. The payload shapes here are the source of truth
 * the worker matches:
 *
 *  - `send`        — a deferred outbound send (10s undo window). `{ userId,
 *                    accountId, messageId }`, `runAt = now + 10s`.
 *  - `backfill`    — initial mailbox import after a link. `{ userId, accountId,
 *                    provider }`.
 *  - `incremental` — a provider push (webhook) delta to apply. Gmail carries
 *                    `{ provider:'gmail', emailAddress, historyId }`; Graph carries
 *                    `{ provider:'outlook', subscriptionId, resource, changeType,
 *                    tenantId? }`. The worker resolves the account from the
 *                    provider identifiers.
 *  - `chaser`      — send a follow-up nudge for a reminder. `{ userId, reminderId }`.
 */
import { asService } from '@revido/db/client'
import { jobs } from '@revido/db/schema'
import type { Provider } from '@revido/db'

/** Logical queue names polled by the worker. */
export const JobQueue = {
  send: 'send',
  backfill: 'backfill',
  incremental: 'incremental',
  chaser: 'chaser',
} as const

export type JobQueueName = (typeof JobQueue)[keyof typeof JobQueue]

export interface SendJobPayload {
  userId: string
  accountId: string
  messageId: string
}

export interface BackfillJobPayload {
  userId: string
  accountId: string
  provider: Provider
}

export type IncrementalJobPayload =
  | { provider: 'gmail'; emailAddress: string; historyId: string }
  | {
      provider: 'outlook'
      subscriptionId: string
      resource: string
      changeType: string
      tenantId?: string
    }

export interface ChaserJobPayload {
  userId: string
  reminderId: string
}

/** Insert a job row and return its id. */
export async function enqueueJob(
  queue: JobQueueName,
  payload: Record<string, unknown>,
  options: { runAt?: Date } = {},
): Promise<{ id: string }> {
  return asService(async (tx) => {
    const rows = await tx
      .insert(jobs)
      .values({ queue, payload, runAt: options.runAt ?? new Date() })
      .returning({ id: jobs.id })
    const row = rows.at(0)
    if (!row) throw new Error('failed to enqueue job')
    return row
  })
}

/** The 10-second deferred-send window: cancellable until it elapses. */
export const SEND_UNDO_MS = 10_000

export function sendRunAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + SEND_UNDO_MS)
}
