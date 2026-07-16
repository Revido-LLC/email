/**
 * Typed Supabase / Postgres clients (W2).
 *
 * - Drizzle over `postgres` (postgres-js) — the server's typed SQL client. Reads
 *   `DATABASE_URL` (a service-role / direct connection). Used only in the audited
 *   api/worker path; it is not RLS-scoped, so every query must filter by user.
 * - `createServiceClient()` — a `@supabase/supabase-js` client with the service
 *   role key. Bypasses RLS (Storage, Realtime broadcast, admin ops). Server only.
 * - `createAnonClient(url, anonKey)` — the browser client. RLS-scoped; safe to
 *   ship to `apps/web` for Realtime subscriptions and user-scoped reads.
 *
 * Environment variables (never hardcode secrets; documented for `.env.example`):
 *   DATABASE_URL               postgres connection string (service-role/direct)
 *   SUPABASE_URL               project URL, e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  service-role JWT (server only — never shipped)
 *   SUPABASE_ANON_KEY          anon public key (safe for the browser)
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Schema = typeof schema
export type Database = PostgresJsDatabase<Schema>

function requireEnv(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

/**
 * Build a Drizzle client over postgres-js.
 *
 * `prepare: false` keeps it compatible with Supabase's transaction-mode pooler
 * (pgbouncer), which does not support prepared statements. Pass a `connectionString`
 * to override `DATABASE_URL` (e.g. a direct connection for migrations).
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
  const sql = postgres(connectionString, {
    max: options.max ?? 10,
    prepare: false,
  })
  const db = drizzle(sql, { schema })
  return { db, sql }
}

let sharedDb: Database | undefined
let sharedSql: postgres.Sql | undefined

/** Process-wide Drizzle singleton over `DATABASE_URL` (lazy). */
export function getDb(env: NodeJS.ProcessEnv = process.env): Database {
  if (!sharedDb) {
    const { db, sql } = createDbClient({ env })
    sharedDb = db
    sharedSql = sql
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
 * Service-role Supabase client (server only). Bypasses RLS. Session persistence
 * and token refresh are disabled — it authenticates purely by the service key.
 */
export function createServiceClient(env: NodeJS.ProcessEnv = process.env): SupabaseClient {
  const url = requireEnv('SUPABASE_URL', env)
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY', env)
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Anon Supabase client (browser). RLS-scoped. `url`/`anonKey` are passed in so
 * the browser bundle reads them from its own build-time env (e.g. `VITE_*`)
 * rather than this package reaching for `process.env`.
 */
export function createAnonClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey)
}
