/**
 * WorkerDb — the worker's Postgres access, built on the raw `postgres` (postgres-js)
 * client rather than Drizzle (the worker does not depend on `drizzle-orm`).
 *
 * It re-implements the two RLS entry points from `@revido/db/client` against the
 * same connection role:
 *  - `withUser(userId, fn)` opens a transaction, `SET LOCAL ROLE app_user` +
 *    `set_config('app.user_id', …)`, so GUC Row-Level-Security scopes every query
 *    to that user. Used for all mailbox content.
 *  - `asService(fn)` runs as the owner role (bypasses RLS) for service tables:
 *    `jobs`, `user_keys`, `sync_state`, `usage_counters`.
 *
 * `userId` is validated as a UUID and bound as a parameter (never interpolated).
 */

import { createDbClient } from '@revido/db/client'

/** The pooled client. */
export type Sql = import('postgres').Sql
/** A transaction-scoped client (what `begin` hands the callback). */
export type Tx = import('postgres').TransactionSql
/** A JSON value accepted by `sql.json(...)`. */
export type JsonValue = import('postgres').JSONValue

export interface WorkerDb {
  readonly sql: Sql
  asService<T>(fn: (tx: Tx) => Promise<T>): Promise<T>
  withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T>
  close(): Promise<void>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function assertUuid(userId: string): void {
  if (typeof userId !== 'string' || !UUID_RE.test(userId)) {
    throw new Error(`withUser: expected a UUID userId, got: ${String(userId)}`)
  }
}

/** Wrap an existing postgres-js client (used in tests + by {@link createWorkerDb}). */
export function makeWorkerDb(sql: Sql): WorkerDb {
  return {
    sql,
    async asService<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
      // Box the result so postgres-js's array-unwrapping never rewrites the type.
      const boxed = await sql.begin(async (tx) => ({ value: await fn(tx) }))
      return boxed.value
    },
    async withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
      assertUuid(userId)
      const boxed = await sql.begin(async (tx) => {
        await tx`set local role app_user`
        await tx`select set_config('app.user_id', ${userId}, true)`
        return { value: await fn(tx) }
      })
      return boxed.value
    },
    close(): Promise<void> {
      return sql.end()
    },
  }
}

/** Build a WorkerDb over `DATABASE_URL` (reuses `@revido/db` connection settings). */
export function createWorkerDb(env: NodeJS.ProcessEnv = process.env): WorkerDb {
  const { sql } = createDbClient({ env })
  return makeWorkerDb(sql)
}
