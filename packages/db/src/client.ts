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
 * ⚠️ DEPLOY REQUIREMENT — the `DATABASE_URL` role MUST be a superuser or a
 * `BYPASSRLS` role. The content tables are `ENABLE + FORCE ROW LEVEL SECURITY`, and
 * `FORCE` applies RLS to the TABLE OWNER too. So `asService` only actually bypasses
 * RLS (which the service-role reads/writes to `sync_state`, cross-user account
 * resolution, etc. depend on) when the connection role has `rolbypassrls` or is a
 * superuser. Railway's default `postgres` role is a superuser, so this holds out of
 * the box — but a least-privilege role would silently see ZERO rows on those tables.
 * `assertServiceRoleBypassesRls()` logs a loud warning at startup if it doesn't.
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
 *
 * NOTE: on the `FORCE ROW LEVEL SECURITY` content tables this only bypasses RLS if
 * the connection role is a superuser or has `BYPASSRLS` — see the file header and
 * {@link assertServiceRoleBypassesRls}.
 */
export async function asService<T>(
  fn: (tx: DbTransaction) => Promise<T>,
  db: Database = getDb(),
): Promise<T> {
  return db.transaction(fn)
}

/** The privilege probe result: does the connection role bypass RLS on FORCE tables? */
export interface ServiceRolePrivilege {
  role: string
  isSuperuser: boolean
  bypassRls: boolean
  /** True when the role can bypass RLS on `FORCE`d tables (superuser OR rolbypassrls). */
  bypasses: boolean
}

/**
 * One-time startup probe: confirm the connection (service) role can bypass RLS on
 * the `FORCE`d content tables. If it can't, the many `asService` reads/writes to
 * those tables (sync cursors, cross-user account resolution from webhooks, …) would
 * silently return/affect zero rows. Logs a loud warning rather than throwing, so a
 * misconfigured deploy is visible without hard-crashing the process.
 *
 * Returns the probe result (also useful in tests). Never throws on a query error —
 * it logs and reports `bypasses: true` optimistically so a transient probe failure
 * doesn't spam warnings.
 */
export async function assertServiceRoleBypassesRls(
  db: Database = getDb(),
  logger: Pick<Console, 'warn'> = console,
): Promise<ServiceRolePrivilege> {
  try {
    const rows = (await asService(
      (tx) =>
        tx.execute(sql`
          select current_user as role,
                 current_setting('is_superuser') = 'on' as is_superuser,
                 coalesce(
                   (select rolbypassrls from pg_roles where rolname = current_user),
                   false
                 ) as bypass_rls
        `),
      db,
    )) as unknown as { role: string; is_superuser: boolean; bypass_rls: boolean }[]
    const row = rows[0]
    const isSuperuser = Boolean(row?.is_superuser)
    const bypassRls = Boolean(row?.bypass_rls)
    const result: ServiceRolePrivilege = {
      role: row?.role ?? 'unknown',
      isSuperuser,
      bypassRls,
      bypasses: isSuperuser || bypassRls,
    }
    if (!result.bypasses) {
      logger.warn(
        `[db] SERVICE ROLE WARNING: connection role "${result.role}" is neither a superuser ` +
          'nor a BYPASSRLS role. FORCE ROW LEVEL SECURITY applies to the owner too, so ' +
          'asService() will see/affect ZERO rows on content tables (sync_state, accounts, …). ' +
          'Grant BYPASSRLS to the DATABASE_URL role.',
      )
    }
    return result
  } catch (err) {
    logger.warn(
      `[db] could not verify service-role RLS bypass: ${err instanceof Error ? err.message : String(err)}`,
    )
    return { role: 'unknown', isSuperuser: false, bypassRls: false, bypasses: true }
  }
}
