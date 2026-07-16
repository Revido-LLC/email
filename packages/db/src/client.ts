/**
 * Typed Postgres client for the Railway stack (Railway Postgres + Better Auth).
 *
 * Drizzle over `postgres` (postgres-js), reading `DATABASE_URL`. The connection
 * role owns the tables, so it can:
 *
 * - `withUser(userId, fn)` — open a transaction, `SET LOCAL ROLE app_user` and
 *   `set_config('app.user_id', userId, true)`, then run `fn(tx)`. Because
 *   `app_user` is a non-owner role, GUC-based Row Level Security applies and every
 *   query is transparently scoped to that user (see the RLS migration). This is
 *   the path for all user-scoped mailbox content.
 * - `asService(fn)` — run `fn(tx)` as the connection (owner) role, which bypasses
 *   RLS. Used for system tables that have no `app_user` grant / policy:
 *   `user_keys`, `audit_log`, the Better Auth tables, and `jobs`.
 *
 * Environment variables (never hardcode secrets; documented for `.env.example`):
 *   DATABASE_URL   Postgres connection string (Railway; the owner/service role).
 */
import { sql } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Schema = typeof schema
export type Database = PostgresJsDatabase<Schema>

/** The transaction handle passed to `withUser` / `asService` callbacks. */
export type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]

function requireEnv(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Guard a value is a canonical UUID before it reaches a `SET`/`set_config` call. */
function assertUuid(userId: string): string {
  if (typeof userId !== 'string' || !UUID_RE.test(userId)) {
    throw new Error(`withUser: expected a UUID userId, got: ${String(userId)}`)
  }
  return userId
}

/**
 * Build a Drizzle client over postgres-js.
 *
 * `prepare: false` keeps it compatible with transaction-mode connection poolers
 * (which do not support prepared statements). Pass a `connectionString` to
 * override `DATABASE_URL` (e.g. a direct connection for migrations).
 */
export function createDbClient(
  options: {
    connectionString?: string
    env?: NodeJS.ProcessEnv
    max?: number
  } = {},
): { db: Database; sql: postgres.Sql } {
  const env = options.env ?? process.env
  const connectionString = options.connectionString ?? requireEnv('DATABASE_URL', env)
  const client = postgres(connectionString, {
    max: options.max ?? 10,
    prepare: false,
  })
  const db = drizzle(client, { schema })
  return { db, sql: client }
}

let sharedDb: Database | undefined
let sharedSql: postgres.Sql | undefined

/** Process-wide Drizzle singleton over `DATABASE_URL` (lazy). */
export function getDb(env: NodeJS.ProcessEnv = process.env): Database {
  if (!sharedDb) {
    const { db, sql: client } = createDbClient({ env })
    sharedDb = db
    sharedSql = client
  }
  return sharedDb
}

/** Close the shared postgres connection (tests / graceful shutdown). */
export async function closeDb(): Promise<void> {
  if (sharedSql) {
    await sharedSql.end()
    sharedSql = undefined
    sharedDb = undefined
  }
}

/**
 * Run `fn` inside a transaction scoped to `userId` under GUC Row Level Security.
 *
 * Sets, transaction-locally: the `app_user` role (a non-owner role, so RLS is
 * enforced) and `app.user_id`, which every RLS policy reads via
 * `current_setting('app.user_id', true)::uuid`. `userId` is validated as a UUID
 * and bound as a parameter to `set_config`, so it is never string-interpolated
 * into SQL. Use this for all user-scoped content access.
 */
export async function withUser<T>(
  userId: string,
  fn: (tx: DbTransaction) => Promise<T>,
  db: Database = getDb(),
): Promise<T> {
  assertUuid(userId)
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role app_user`)
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`)
    return fn(tx)
  })
}

/**
 * Run `fn` inside a transaction as the connection (owner) role, which bypasses
 * RLS. Use for system tables that are not app_user-accessible: `user_keys`,
 * `audit_log`, the Better Auth tables, and `jobs`.
 */
export async function asService<T>(
  fn: (tx: DbTransaction) => Promise<T>,
  db: Database = getDb(),
): Promise<T> {
  return db.transaction(fn)
}
