/**
 * The background job queue (replaces Supabase pgmq on the Railway stack).
 *
 * A plain table polled by `apps/worker`: pick the oldest due (`run_at <= now()`),
 * `pending` row for a queue, lock it (`locked_at` / `locked_by`), run it, then
 * mark `done`/`failed` (retrying up to `max_attempts`). SERVICE-ACCESSED only —
 * touched via `asService`; not granted to `app_user` and carries no RLS policy.
 */
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { createdAt } from './columns'

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Logical queue name, e.g. "backfill", "embed", "triage". */
    queue: text('queue').notNull(),
    /** Job arguments (plaintext JSON — no mailbox content). */
    payload: jsonb('payload'),
    /** Earliest time the job may run (drives scheduling + backoff). */
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    /** Set when a worker claims the row; cleared on completion/release. */
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: text('locked_by'),
    /** Lifecycle: 'pending' | 'done' | 'failed'. */
    status: text('status').notNull().default('pending'),
    lastError: text('last_error'),
    createdAt: createdAt(),
  },
  (t) => [index('jobs_queue_status_run_at_idx').on(t.queue, t.status, t.runAt)],
)
