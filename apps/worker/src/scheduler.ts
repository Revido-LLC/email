/**
 * node-cron scheduler — ENQUEUES periodic work (never runs it inline).
 *
 * Cron ticks push jobs onto the same `jobs` queue the runner drains, so periodic
 * work gets the same locking, retry, and backoff as everything else:
 *  - daily     → `renew_watch` for Gmail accounts (7-day `users.watch` expiry)
 *  - ~2 days   → `renew_watch` for Outlook accounts (~3-day Graph subscription)
 *  - 30 min    → `reconcile` per account (missed-push safety-net delta sweep)
 *  - daily     → `digest` per user (digest generation)
 *
 * The enqueue functions are pure of cron and unit-tested with fakes; `startScheduler`
 * only wires them to a `CronScheduler` (node-cron by default, injectable for tests).
 */

import * as cron from 'node-cron'
import type { Provider } from '@revido/db'
import type { JobStore } from './queue/store'
import type { Logger } from './queue/runner'
import {
  QUEUE,
  type DigestPayload,
  type ReconcilePayload,
  type RenewWatchPayload,
} from './queue/jobs'
import type { WorkerDb } from './db/client'

export interface AccountSummary {
  id: string
  provider: Provider
}

/** Read model the scheduler fans out over. */
export interface ScheduleRepo {
  listAccounts(): Promise<AccountSummary[]>
  listUserIds(): Promise<string[]>
}

export class PgScheduleRepo implements ScheduleRepo {
  constructor(private readonly db: WorkerDb) {}

  listAccounts(): Promise<AccountSummary[]> {
    return this.db.asService((sql) => sql<AccountSummary[]>`select id, provider from accounts`)
  }

  async listUserIds(): Promise<string[]> {
    const rows = await this.db.asService((sql) => sql<{ id: string }[]>`select id from users`)
    return rows.map((r) => r.id)
  }
}

export interface SchedulerDeps {
  jobs: Pick<JobStore, 'enqueue'>
  schedule: ScheduleRepo
  logger: Logger
}

export async function enqueueWatchRenewals(deps: SchedulerDeps, provider: Provider): Promise<number> {
  const accounts = (await deps.schedule.listAccounts()).filter((a) => a.provider === provider)
  for (const account of accounts) {
    const job: RenewWatchPayload = { accountId: account.id }
    await deps.jobs.enqueue(QUEUE.renewWatch, job)
  }
  return accounts.length
}

export async function enqueueReconcileSweep(deps: SchedulerDeps): Promise<number> {
  const accounts = await deps.schedule.listAccounts()
  for (const account of accounts) {
    const job: ReconcilePayload = { accountId: account.id }
    await deps.jobs.enqueue(QUEUE.reconcile, job)
  }
  return accounts.length
}

export async function enqueueDailyDigests(deps: SchedulerDeps): Promise<number> {
  const userIds = await deps.schedule.listUserIds()
  for (const userId of userIds) {
    const job: DigestPayload = { userId }
    await deps.jobs.enqueue(QUEUE.digest, job)
  }
  return userIds.length
}

/** A cron binding: register `task` on `cronExpression`, return a stoppable handle. */
export type CronScheduler = (cronExpression: string, task: () => void) => { stop: () => void }

const defaultCron: CronScheduler = (expr, task) => cron.schedule(expr, task)

export const CRON_EXPRESSIONS = {
  gmailWatch: '0 3 * * *', // daily 03:00
  outlookWatch: '0 4 */2 * *', // every 2 days 04:00
  reconcile: '*/30 * * * *', // every 30 minutes
  digest: '0 7 * * *', // daily 07:00
} as const

function fireAndLog(deps: SchedulerDeps, name: string, run: () => Promise<number>): void {
  run()
    .then((count) => deps.logger.info(`scheduled ${name} enqueued`, { count }))
    .catch((err: unknown) =>
      deps.logger.error(`scheduled ${name} failed`, {
        error: err instanceof Error ? err.message : String(err),
      }),
    )
}

export function startScheduler(
  deps: SchedulerDeps,
  scheduleFn: CronScheduler = defaultCron,
): { stop: () => void } {
  const tasks = [
    scheduleFn(CRON_EXPRESSIONS.gmailWatch, () =>
      fireAndLog(deps, 'gmail watch renewal', () => enqueueWatchRenewals(deps, 'gmail')),
    ),
    scheduleFn(CRON_EXPRESSIONS.outlookWatch, () =>
      fireAndLog(deps, 'outlook watch renewal', () => enqueueWatchRenewals(deps, 'outlook')),
    ),
    scheduleFn(CRON_EXPRESSIONS.reconcile, () =>
      fireAndLog(deps, 'reconcile sweep', () => enqueueReconcileSweep(deps)),
    ),
    scheduleFn(CRON_EXPRESSIONS.digest, () =>
      fireAndLog(deps, 'daily digest', () => enqueueDailyDigests(deps)),
    ),
  ]
  deps.logger.info('scheduler started', { tasks: tasks.length })
  return {
    stop: () => {
      for (const task of tasks) task.stop()
    },
  }
}
