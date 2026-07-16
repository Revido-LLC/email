-- Row Level Security for the Railway Postgres stack (plain PG18, no Supabase).
--
-- There is no Supabase auth schema and no service JWT. Instead the server owns
-- the connection (the `DATABASE_URL` role) and enforces tenancy with a GUC + a
-- non-owner role:
--
--   * For user-scoped content it runs `withUser(userId, fn)`, which opens a
--     transaction and does `SET LOCAL ROLE app_user` + `set_config('app.user_id',
--     userId, true)`. Because `app_user` is NOT the table owner, RLS is enforced,
--     and every policy compares `user_id = current_setting('app.user_id', true)::uuid`.
--   * For system tables (user_keys, audit_log, Better Auth, jobs) it runs
--     `asService(fn)` as the owner role, which bypasses RLS.
--
-- Better Auth's tables (session/account/verification) and the jobs queue are
-- created and locked down in 0002; only the shared `users` table is handled here
-- (it is both Better Auth's `user` model and a user-scoped content table).

-- ---------------------------------------------------------------------------
-- The tenancy role. NOLOGIN: the server never connects as it, it only
-- `SET LOCAL ROLE app_user` inside a withUser() transaction. Grant membership to
-- the current (migration/connection) role so that SET ROLE is permitted.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END $$;--> statement-breakpoint
GRANT "app_user" TO CURRENT_USER;--> statement-breakpoint

GRANT USAGE ON SCHEMA "public" TO "app_user";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "public" TO "app_user";--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "public"
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "app_user";--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- pgvector ANN index for semantic search (cosine distance, HNSW).
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "message_embeddings_embedding_hnsw"
  ON "message_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- users: keyed on `id` (not `user_id`). Enabled but NOT forced — Better Auth
-- writes users through the owner role (asService/getDb) during sign-up and must
-- bypass RLS, while `app_user` (via withUser) is scoped to its own row.
-- ---------------------------------------------------------------------------
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "users_self" ON "users"
  FOR ALL TO "app_user"
  USING ("id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Standard user-scoped content tables: owner-only via
-- `user_id = current_setting('app.user_id', true)::uuid`. ENABLE + FORCE so the
-- rule holds even if the owner role ever queries them directly.
-- ---------------------------------------------------------------------------
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "accounts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "accounts_owner" ON "accounts"
  FOR ALL TO "app_user"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contacts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "contacts_owner" ON "contacts"
  FOR ALL TO "app_user"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "sync_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sync_state" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sync_state_owner" ON "sync_state"
  FOR ALL TO "app_user"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "threads" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "threads_owner" ON "threads"
  FOR ALL TO "app_user"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "thread_participants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "thread_participants" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "thread_participants_owner" ON "thread_participants"
  FOR ALL TO "app_user"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "messages_owner" ON "messages"
  FOR ALL TO "app_user"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "message_recipients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "message_recipients" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "message_recipients_owner" ON "message_recipients"
  FOR ALL TO "app_user"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attachments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "attachments_owner" ON "attachments"
  FOR ALL TO "app_user"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "extracted_facts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "extracted_facts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "extracted_facts_owner" ON "extracted_facts"
  FOR ALL TO "app_user"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "thread_badges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "thread_badges" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "thread_badges_owner" ON "thread_badges"
  FOR ALL TO "app_user"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "message_embeddings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "message_embeddings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "message_embeddings_owner" ON "message_embeddings"
  FOR ALL TO "app_user"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "agents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agents" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "agents_owner" ON "agents"
  FOR ALL TO "app_user"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "agent_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_actions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "agent_actions_owner" ON "agent_actions"
  FOR ALL TO "app_user"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "agent_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_runs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "agent_runs_owner" ON "agent_runs"
  FOR ALL TO "app_user"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "approvals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "approvals" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "approvals_owner" ON "approvals"
  FOR ALL TO "app_user"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "reminders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reminders" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "reminders_owner" ON "reminders"
  FOR ALL TO "app_user"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "commitments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "commitments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "commitments_owner" ON "commitments"
  FOR ALL TO "app_user"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "signatures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "signatures" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "signatures_owner" ON "signatures"
  FOR ALL TO "app_user"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

ALTER TABLE "usage_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usage_counters" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "usage_counters_owner" ON "usage_counters"
  FOR ALL TO "app_user"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

-- Leads: a logged-in user reads/writes their own submissions; anonymous capture
-- (user_id IS NULL) goes through the service path (asService).
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "leads" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "leads_owner" ON "leads"
  FOR ALL TO "app_user"
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- user_keys: wrapped DEKs. RLS enabled with NO policy AND the app_user grant
-- revoked, so only the owner role (asService) can ever read/write them. Not
-- forced, so the owner bypasses RLS.
-- ---------------------------------------------------------------------------
REVOKE ALL PRIVILEGES ON TABLE "user_keys" FROM "app_user";--> statement-breakpoint
ALTER TABLE "user_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- audit_log: append-only. app_user may read its own rows (SELECT policy) but
-- never write; only the owner role (asService) appends. A trigger blocks
-- UPDATE/DELETE for everyone, so the trail is immutable.
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON TABLE "audit_log" FROM "app_user";--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "audit_log_read_own" ON "audit_log"
  FOR SELECT TO "app_user"
  USING ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."audit_log_no_mutation"()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not permitted', TG_OP;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "audit_log_block_update"
  BEFORE UPDATE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_no_mutation"();--> statement-breakpoint
CREATE TRIGGER "audit_log_block_delete"
  BEFORE DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_no_mutation"();
