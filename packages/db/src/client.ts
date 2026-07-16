/**
 * Typed Supabase / Postgres clients (W2).
 *
 * - `service-role` client for the server (api/worker) — bypasses RLS, used only
 *   in the audited decrypt path.
 * - `anon` client for the browser — RLS-scoped, safe for Realtime subscriptions.
 *
 * Filled in by the Wave 1 `db-schema` agent (Drizzle over `postgres` +
 * `@supabase/supabase-js`). Reads connection config from env names documented in
 * `.env.example`. This stub keeps `@revido/db/client` resolvable.
 */
export {}
