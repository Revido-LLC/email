-- Row Level Security, Supabase-style policies, append-only audit log, the
-- pgvector ANN index, and the async-infra extensions (pgmq, pg_cron).
--
-- Targets a Supabase Postgres: it references `auth.uid()` and `auth.users`. Every
-- user-scoped table gets RLS with an owner policy so the browser anon/authenticated
-- client only ever sees its own rows (Realtime subscriptions, direct reads). The
-- service role (api/worker) bypasses RLS for the audited decrypt path.

-- ---------------------------------------------------------------------------
-- Async infrastructure extensions (referenced by workers; not by table DDL).
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgmq;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_cron;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Tie the app users table to Supabase auth. `public.users.id` = `auth.users.id`.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE "users"
    ADD CONSTRAINT "users_id_auth_users_fk"
    FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL; -- auth schema absent (non-Supabase target)
END $$;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- pgvector ANN index for semantic search (cosine distance, HNSW).
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "message_embeddings_embedding_hnsw"
  ON "message_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- The users table keys on `id` (not `user_id`): policy compares id = auth.uid().
-- ---------------------------------------------------------------------------
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "users_self" ON "users"
  FOR ALL TO authenticated
  USING ("id" = auth.uid()) WITH CHECK ("id" = auth.uid());--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Standard user-scoped tables: owner-only via `user_id = auth.uid()`.
-- ---------------------------------------------------------------------------
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "accounts_owner" ON "accounts"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid()) WITH CHECK ("user_id" = auth.uid());--> statement-breakpoint

ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "contacts_owner" ON "contacts"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid()) WITH CHECK ("user_id" = auth.uid());--> statement-breakpoint

ALTER TABLE "sync_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sync_state_owner" ON "sync_state"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid()) WITH CHECK ("user_id" = auth.uid());--> statement-breakpoint

ALTER TABLE "threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "threads_owner" ON "threads"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid()) WITH CHECK ("user_id" = auth.uid());--> statement-breakpoint

ALTER TABLE "thread_participants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "thread_participants_owner" ON "thread_participants"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid()) WITH CHECK ("user_id" = auth.uid());--> statement-breakpoint

ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "messages_owner" ON "messages"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid()) WITH CHECK ("user_id" = auth.uid());--> statement-breakpoint

ALTER TABLE "message_recipients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "message_recipients_owner" ON "message_recipients"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid()) WITH CHECK ("user_id" = auth.uid());--> statement-breakpoint

ALTER TABLE "attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "attachments_owner" ON "attachments"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid()) WITH CHECK ("user_id" = auth.uid());--> statement-breakpoint

ALTER TABLE "extracted_facts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "extracted_facts_owner" ON "extracted_facts"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid()) WITH CHECK ("user_id" = auth.uid());--> statement-breakpoint

ALTER TABLE "thread_badges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "thread_badges_owner" ON "thread_badges"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid()) WITH CHECK ("user_id" = auth.uid());--> statement-breakpoint

ALTER TABLE "message_embeddings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "message_embeddings_owner" ON "message_embeddings"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid()) WITH CHECK ("user_id" = auth.uid());--> statement-breakpoint

ALTER TABLE "agents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "agents_owner" ON "agents"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid()) WITH CHECK ("user_id" = auth.uid());--> statement-breakpoint

ALTER TABLE "agent_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "agent_actions_owner" ON "agent_actions"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid()) WITH CHECK ("user_id" = auth.uid());--> statement-breakpoint

ALTER TABLE "agent_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "agent_runs_owner" ON "agent_runs"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid()) WITH CHECK ("user_id" = auth.uid());--> statement-breakpoint

ALTER TABLE "approvals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "approvals_owner" ON "approvals"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid()) WITH CHECK ("user_id" = auth.uid());--> statement-breakpoint

ALTER TABLE "reminders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "reminders_owner" ON "reminders"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid()) WITH CHECK ("user_id" = auth.uid());--> statement-breakpoint

ALTER TABLE "commitments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "commitments_owner" ON "commitments"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid()) WITH CHECK ("user_id" = auth.uid());--> statement-breakpoint

ALTER TABLE "signatures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "signatures_owner" ON "signatures"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid()) WITH CHECK ("user_id" = auth.uid());--> statement-breakpoint

ALTER TABLE "usage_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "usage_counters_owner" ON "usage_counters"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid()) WITH CHECK ("user_id" = auth.uid());--> statement-breakpoint

-- Leads: a user may create and read their own submissions; the service role
-- reads the full funnel. Anonymous capture goes through a service-role path.
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "leads_owner" ON "leads"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid()) WITH CHECK ("user_id" = auth.uid());--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- user_keys: wrapped DEKs. RLS enabled with NO policy, so only the service role
-- (which bypasses RLS) can ever read/write them. The browser must never touch a
-- wrapped DEK.
-- ---------------------------------------------------------------------------
ALTER TABLE "user_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_keys" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- audit_log: append-only. Users may read their own rows; only the service role
-- writes. A trigger blocks UPDATE/DELETE for everyone, so the trail is immutable.
-- ---------------------------------------------------------------------------
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "audit_log_read_own" ON "audit_log"
  FOR SELECT TO authenticated
  USING ("user_id" = auth.uid());--> statement-breakpoint

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
  FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_no_mutation"();--> statement-breakpoint
