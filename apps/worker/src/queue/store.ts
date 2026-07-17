/**
 * JobStore — the `jobs` queue persistence port + a raw-SQL implementation.
 *
 * The runner (see `./runner`) depends on this narrow port so its claim/backoff
 * logic is unit-testable without Postgres. `PgJobStore` runs entirely as the
 * service role (the queue has no `app_user` grant and no RLS policy).
 *
 * Claiming uses `SELECT … FOR UPDATE SKIP LOCKED` inside the claiming UPDATE so
 * each due row is handed to exactly one worker; `locked_at`/`locked_by` then hide
 * the row from the next claim while it runs. The lock is released (row marked
 * done/failed) in a separate statement so a slow job never holds a DB lock. A
 * `locked_at` older than `lockTtlMs` is reclaimable — the crash safety net.
 */

import type { JsonValue, WorkerDb } from '../db/client'

/** A row handed to a consumer. `payload` is validated by the consumer. */
export interface ClaimedJob {
  id: string
  queue: string
  payload: unknown
  attempts: number
  maxAttempts: number
}

export interface JobFailure {
  attempts: number
  maxAttempts: number
  error: string
  /** When the row becomes eligible again (backoff); ignored once failed. */
  runAt: Date
}

export interface JobStore {
  /** Claim the oldest due, unlocked `pending` row for this worker, or null. */
  claim(workerId: string): Promise<ClaimedJob | null>
  /** Mark a job `done`. */
  complete(jobId: string): Promise<void>
  /** Record a failed attempt: retry with backoff, or mark `failed` at the cap. */
  fail(jobId: string, failure: JobFailure): Promise<void>
  /** Enqueue a new job (default `run_at = now`). */
  enqueue(queue: string, payload: unknown, opts?: { runAt?: Date }): Promise<void>
}

interface JobRow {
  id: string
  queue: string
  payload: unknown
  attempts: number
  max_attempts: number
}

export interface PgJobStoreOptions {
  /** Reclaim a lock held longer than this (default 15 min). */
  lockTtlMs?: number
  now?: () => Date
}

const DEFAULT_LOCK_TTL_MS = 15 * 60 * 1000

export class PgJobStore implements JobStore {
  private readonly db: WorkerDb
  private readonly lockTtlMs: number
  private readonly now: () => Date

  constructor(db: WorkerDb, options: PgJobStoreOptions = {}) {
    this.db = db
    this.lockTtlMs = options.lockTtlMs ?? DEFAULT_LOCK_TTL_MS
    this.now = options.now ?? ((): Date => new Date())
  }

  async claim(workerId: string): Promise<ClaimedJob | null> {
    const staleBefore = new Date(this.now().getTime() - this.lockTtlMs)
    const rows = await this.db.asService(
      (sql) => sql<JobRow[]>`
        update jobs
        set locked_at = now(), locked_by = ${workerId}
        where id = (
          select id from jobs
          where status = 'pending'
            and run_at <= now()
            and (locked_at is null or locked_at < ${staleBefore})
          order by run_at asc
          limit 1
          for update skip locked
        )
        returning id, queue, payload, attempts, max_attempts
      `,
    )
    const row = rows[0]
    if (!row) return null
    return {
      id: row.id,
      queue: row.queue,
      payload: row.payload,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
    }
  }

  async complete(jobId: string): Promise<void> {
    await this.db.asService(
      (sql) => sql`
        update jobs
        set status = 'done', locked_at = null, locked_by = null, last_error = null
        where id = ${jobId}
      `,
    )
  }

  async fail(jobId: string, failure: JobFailure): Promise<void> {
    const status = failure.attempts >= failure.maxAttempts ? 'failed' : 'pending'
    await this.db.asService(
      (sql) => sql`
        update jobs
        set status = ${status},
            attempts = ${failure.attempts},
            locked_at = null,
            locked_by = null,
            last_error = ${failure.error},
            run_at = ${failure.runAt}
        where id = ${jobId}
      `,
    )
  }

  async enqueue(queue: string, payload: unknown, opts: { runAt?: Date } = {}): Promise<void> {
    const runAt = opts.runAt ?? this.now()
    await this.db.asService(
      (sql) => sql`
        insert into jobs (queue, payload, run_at)
        values (${queue}, ${sql.json(payload as JsonValue)}, ${runAt})
      `,
    )
  }
}
