-- Scape-parity foundation: workspaces, calendars, meetings, configurable labels,
-- artifacts, and a unified semantic index.
CREATE TABLE IF NOT EXISTS "workspaces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "plan" text DEFAULT 'trial' NOT NULL,
  "trial_ends_at" timestamp with time zone,
  "stripe_customer_id" text,
  "stripe_subscription_id" text,
  "subscription_status" text,
  "retention_days" integer DEFAULT 365 NOT NULL,
  "feature_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "ai_policy" jsonb DEFAULT '{"drafts":true,"chat":true,"meetings":true,"artifacts":false}'::jsonb NOT NULL,
  "support_contact" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspaces_slug_uq" ON "workspaces" ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspaces_owner_user_id_idx" ON "workspaces" ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspaces_stripe_customer_uq" ON "workspaces" ("stripe_customer_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "workspace_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "role" text DEFAULT 'member' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "invited_email" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_memberships_workspace_user_uq" ON "workspace_memberships" ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_memberships_user_id_idx" ON "workspace_memberships" ("user_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "calendar_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade,
  "external_calendar_id" text DEFAULT 'primary' NOT NULL,
  "sync_token_ct" jsonb,
  "enabled" boolean DEFAULT true NOT NULL,
  "last_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_accounts_account_calendar_uq" ON "calendar_accounts" ("account_id","external_calendar_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_accounts_user_id_idx" ON "calendar_accounts" ("user_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "calendar_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "calendar_account_id" uuid NOT NULL REFERENCES "calendar_accounts"("id") ON DELETE cascade,
  "external_id" text NOT NULL,
  "title_ct" jsonb,
  "description_ct" jsonb,
  "location_ct" jsonb,
  "join_url_ct" jsonb,
  "attendees_ct" jsonb,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "timezone" text,
  "status" text DEFAULT 'confirmed' NOT NULL,
  "recurring_event_id" text,
  "etag" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_events_account_external_uq" ON "calendar_events" ("calendar_account_id","external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_events_user_starts_at_idx" ON "calendar_events" ("user_id","starts_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "meetings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "workspace_id" uuid REFERENCES "workspaces"("id") ON DELETE set null,
  "calendar_event_id" uuid REFERENCES "calendar_events"("id") ON DELETE set null,
  "title_ct" jsonb,
  "status" text DEFAULT 'queued' NOT NULL,
  "source" text DEFAULT 'web' NOT NULL,
  "meeting_provider" text,
  "recording_mode" text DEFAULT 'tab-and-mic' NOT NULL,
  "language" text,
  "duration_ms" integer,
  "started_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "raw_audio_ref_ct" jsonb,
  "raw_audio_delete_after" timestamp with time zone,
  "error_code" text,
  "consent_acknowledged_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meetings_user_started_at_idx" ON "meetings" ("user_id","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meetings_user_status_idx" ON "meetings" ("user_id","status");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "meeting_participants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "meeting_id" uuid NOT NULL REFERENCES "meetings"("id") ON DELETE cascade,
  "participant_ct" jsonb,
  "is_organizer" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meeting_participants_meeting_idx" ON "meeting_participants" ("meeting_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "transcript_segments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "meeting_id" uuid NOT NULL REFERENCES "meetings"("id") ON DELETE cascade,
  "sequence" integer NOT NULL,
  "starts_at_ms" integer NOT NULL,
  "ends_at_ms" integer NOT NULL,
  "speaker_ct" jsonb,
  "text_ct" jsonb,
  "language" text,
  "confidence" real,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transcript_segments_meeting_sequence_uq" ON "transcript_segments" ("meeting_id","sequence");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transcript_segments_user_id_idx" ON "transcript_segments" ("user_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "meeting_summaries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "meeting_id" uuid NOT NULL REFERENCES "meetings"("id") ON DELETE cascade,
  "summary_ct" jsonb,
  "decisions_ct" jsonb,
  "questions_ct" jsonb,
  "action_items_ct" jsonb,
  "model" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meeting_summaries_meeting_uq" ON "meeting_summaries" ("meeting_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "recording_chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "meeting_id" uuid NOT NULL REFERENCES "meetings"("id") ON DELETE cascade,
  "sequence" integer NOT NULL,
  "size_bytes" integer NOT NULL,
  "checksum" text NOT NULL,
  "storage_ref_ct" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recording_chunks_meeting_sequence_uq" ON "recording_chunks" ("meeting_id","sequence");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recording_chunks_user_id_idx" ON "recording_chunks" ("user_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "custom_labels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "workspace_id" uuid REFERENCES "workspaces"("id") ON DELETE set null,
  "name" text NOT NULL,
  "description_ct" jsonb,
  "color" text DEFAULT 'blue' NOT NULL,
  "icon" text DEFAULT 'tag' NOT NULL,
  "priority" integer DEFAULT 50 NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "custom_labels_user_name_uq" ON "custom_labels" ("user_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "custom_labels_user_priority_idx" ON "custom_labels" ("user_id","priority");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "thread_custom_labels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "thread_id" uuid NOT NULL REFERENCES "threads"("id") ON DELETE cascade,
  "label_id" uuid NOT NULL REFERENCES "custom_labels"("id") ON DELETE cascade,
  "confidence" real,
  "corrected_by_user" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "thread_custom_labels_thread_label_uq" ON "thread_custom_labels" ("thread_id","label_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "thread_custom_labels_user_id_idx" ON "thread_custom_labels" ("user_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "workspace_id" uuid REFERENCES "workspaces"("id") ON DELETE set null,
  "name" text NOT NULL,
  "mime" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "source_attachment_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artifacts_user_updated_at_idx" ON "artifacts" ("user_id","updated_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "artifact_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "artifact_id" uuid NOT NULL REFERENCES "artifacts"("id") ON DELETE cascade,
  "version" integer NOT NULL,
  "content_ct" jsonb,
  "storage_ref_ct" jsonb,
  "instruction_ct" jsonb,
  "size_bytes" integer NOT NULL,
  "checksum" text NOT NULL,
  "scan_status" text DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "artifact_versions_artifact_version_uq" ON "artifact_versions" ("artifact_id","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artifact_versions_user_id_idx" ON "artifact_versions" ("user_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "content_embeddings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "source_type" text NOT NULL,
  "source_id" uuid NOT NULL,
  "chunk_index" integer DEFAULT 0 NOT NULL,
  "content_ct" jsonb,
  "embedding" vector(1024) NOT NULL,
  "model" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "content_embeddings_source_chunk_uq" ON "content_embeddings" ("user_id","source_type","source_id","chunk_index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_embeddings_user_source_idx" ON "content_embeddings" ("user_id","source_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_embeddings_embedding_hnsw" ON "content_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "billing_events" (
  "id" text PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "livemode" boolean NOT NULL,
  "processed_at" timestamp with time zone,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Standard user-owned content.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'calendar_accounts','calendar_events','meetings','meeting_participants',
    'transcript_segments','meeting_summaries','recording_chunks','custom_labels',
    'thread_custom_labels','artifacts','artifact_versions','content_embeddings'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO app_user USING (user_id = current_setting(''app.user_id'', true)::uuid) WITH CHECK (user_id = current_setting(''app.user_id'', true)::uuid)',
      table_name || '_owner', table_name
    );
  END LOOP;
END $$;--> statement-breakpoint

-- Workspace rows are readable only to active members. Writes go through the
-- service path after explicit role checks so membership changes cannot race RLS.
ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workspaces_member_read" ON "workspaces" FOR SELECT TO "app_user"
  USING (EXISTS (
    SELECT 1 FROM "workspace_memberships" m
    WHERE m."workspace_id" = "workspaces"."id"
      AND m."user_id" = current_setting('app.user_id', true)::uuid
      AND m."status" = 'active'
  ));--> statement-breakpoint
ALTER TABLE "workspace_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workspace_memberships_self_read" ON "workspace_memberships" FOR SELECT TO "app_user"
  USING ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE "workspaces" FROM "app_user";--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE "workspace_memberships" FROM "app_user";--> statement-breakpoint

-- Stripe webhook ledger is never user-accessible.
REVOKE ALL PRIVILEGES ON TABLE "billing_events" FROM "app_user";--> statement-breakpoint
ALTER TABLE "billing_events" ENABLE ROW LEVEL SECURITY;
