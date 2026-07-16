-- Extensions required by this schema. `vector` must exist before the
-- `message_embeddings.embedding vector(1024)` column is created below. `pgcrypto`
-- backs `gen_random_uuid()` (also native on PG13+, but enabled here for safety).
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('done', 'pending-approval', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."attachment_kind" AS ENUM('pdf', 'image', 'doc', 'sheet', 'zip', 'other');--> statement-breakpoint
CREATE TYPE "public"."category" AS ENUM('to-reply', 'awaiting-reply', 'fyi', 'newsletters', 'notifications', 'promotions', 'receipts', 'calendar', 'personal');--> statement-breakpoint
CREATE TYPE "public"."extracted_fact_type" AS ENUM('date', 'amount', 'tracking', 'link', 'action', 'contact');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'qualified', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."output_language" AS ENUM('match', 'en', 'nl');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('urgent', 'high', 'normal', 'low');--> statement-breakpoint
CREATE TYPE "public"."provider" AS ENUM('gmail', 'outlook');--> statement-breakpoint
CREATE TYPE "public"."recipient_kind" AS ENUM('to', 'cc', 'bcc');--> statement-breakpoint
CREATE TYPE "public"."reminder_kind" AS ENUM('follow-up', 'deadline', 'snoozed');--> statement-breakpoint
CREATE TYPE "public"."thread_badge_kind" AS ENUM('attachment', 'amount', 'date', 'tracking', 'people');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "provider" NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"avatar_url" text,
	"access_token_ct" jsonb,
	"refresh_token_ct" jsonb,
	"token_expires_at" timestamp with time zone,
	"scopes" text[],
	"sync_progress" real DEFAULT 0 NOT NULL,
	"sync_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"provider" "provider" NOT NULL,
	"history_id" text,
	"delta_link" text,
	"backfill_cursor" text,
	"backfill_complete" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone,
	"status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_keys" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"wrapped_dek" text NOT NULL,
	"scheme_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"avatar_url" text,
	"output_language" "output_language" DEFAULT 'match' NOT NULL,
	"voice_profile_ct" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"name" text NOT NULL,
	"size" text,
	"size_bytes" integer,
	"mime" text,
	"kind" "attachment_kind" DEFAULT 'other' NOT NULL,
	"storage_ref_ct" jsonb,
	"content_ct" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extracted_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"type" "extracted_fact_type" NOT NULL,
	"label_ct" jsonb,
	"value_ct" jsonb,
	"href_ct" jsonb,
	"done" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_embeddings" (
	"message_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_recipients" (
	"message_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"kind" "recipient_kind" NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "message_recipients_message_id_contact_id_kind_pk" PRIMARY KEY("message_id","contact_id","kind")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"provider_message_id" text,
	"from_contact_id" uuid,
	"date" timestamp with time zone NOT NULL,
	"raw_html_ct" jsonb,
	"html_ct" jsonb,
	"text_ct" jsonb,
	"unread" boolean DEFAULT true NOT NULL,
	"outbound" boolean DEFAULT false NOT NULL,
	"images_blocked" boolean DEFAULT false NOT NULL,
	"language" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thread_badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"kind" "thread_badge_kind" NOT NULL,
	"label_ct" jsonb,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thread_participants" (
	"thread_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "thread_participants_thread_id_contact_id_pk" PRIMARY KEY("thread_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"provider_thread_id" text,
	"subject_ct" jsonb,
	"category" "category" NOT NULL,
	"priority" "priority" DEFAULT 'normal' NOT NULL,
	"priority_score" integer DEFAULT 0 NOT NULL,
	"tldr_ct" jsonb,
	"summary_ct" jsonb,
	"unread" boolean DEFAULT true NOT NULL,
	"starred" boolean DEFAULT false NOT NULL,
	"snoozed_until" timestamp with time zone,
	"has_attachments" boolean DEFAULT false NOT NULL,
	"awaiting_reply" boolean DEFAULT false NOT NULL,
	"labels" text[] DEFAULT '{}' NOT NULL,
	"language" text,
	"last_message_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"type" text NOT NULL,
	"label" text NOT NULL,
	"needs_approval" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_id" uuid,
	"agent_name" text,
	"agent_icon" text,
	"at" timestamp with time zone NOT NULL,
	"summary_ct" jsonb,
	"reasoning_ct" jsonb,
	"affected_ct" jsonb,
	"status" "agent_run_status" DEFAULT 'done' NOT NULL,
	"reversible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"accent" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"trigger" text,
	"conditions" text[] DEFAULT '{}' NOT NULL,
	"run_count" integer DEFAULT 0 NOT NULL,
	"affected_count" integer DEFAULT 0 NOT NULL,
	"prebuilt" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_id" uuid,
	"agent_name" text,
	"agent_icon" text,
	"action" text NOT NULL,
	"thread_id" uuid,
	"subject_ct" jsonb,
	"sender" text,
	"preview_ct" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commitments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"text_ct" jsonb,
	"thread_id" uuid,
	"subject_ct" jsonb,
	"counterpart" text,
	"due_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "reminder_kind" NOT NULL,
	"thread_id" uuid,
	"subject_ct" jsonb,
	"context_ct" jsonb,
	"sender" text,
	"due_at" timestamp with time zone NOT NULL,
	"draft_reply_ct" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"html_ct" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"name" text,
	"company" text,
	"message" text,
	"source" text,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"period" text NOT NULL,
	"count" bigint DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone,
	"window_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_state" ADD CONSTRAINT "sync_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_state" ADD CONSTRAINT "sync_state_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_keys" ADD CONSTRAINT "user_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_facts" ADD CONSTRAINT "extracted_facts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_facts" ADD CONSTRAINT "extracted_facts_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_embeddings" ADD CONSTRAINT "message_embeddings_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_embeddings" ADD CONSTRAINT "message_embeddings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_from_contact_id_contacts_id_fk" FOREIGN KEY ("from_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_badges" ADD CONSTRAINT "thread_badges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_badges" ADD CONSTRAINT "thread_badges_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_participants" ADD CONSTRAINT "thread_participants_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_participants" ADD CONSTRAINT "thread_participants_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_participants" ADD CONSTRAINT "thread_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_user_provider_email_uq" ON "accounts" USING btree ("user_id","provider","email");--> statement-breakpoint
CREATE INDEX "contacts_user_id_idx" ON "contacts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_user_email_uq" ON "contacts" USING btree ("user_id","email");--> statement-breakpoint
CREATE INDEX "sync_state_user_id_idx" ON "sync_state" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_state_account_uq" ON "sync_state" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "attachments_user_id_idx" ON "attachments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "attachments_message_id_idx" ON "attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "extracted_facts_user_id_idx" ON "extracted_facts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "extracted_facts_thread_id_idx" ON "extracted_facts" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "message_embeddings_user_id_idx" ON "message_embeddings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "message_recipients_contact_idx" ON "message_recipients" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "message_recipients_user_idx" ON "message_recipients" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_user_id_idx" ON "messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_thread_id_idx" ON "messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "messages_account_id_idx" ON "messages" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "messages_date_idx" ON "messages" USING btree ("thread_id","date");--> statement-breakpoint
CREATE INDEX "thread_badges_user_id_idx" ON "thread_badges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "thread_badges_thread_id_idx" ON "thread_badges" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "thread_participants_contact_idx" ON "thread_participants" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "thread_participants_user_idx" ON "thread_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "threads_user_id_idx" ON "threads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "threads_account_id_idx" ON "threads" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "threads_category_idx" ON "threads" USING btree ("user_id","category");--> statement-breakpoint
CREATE INDEX "threads_last_message_at_idx" ON "threads" USING btree ("user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "agent_actions_user_id_idx" ON "agent_actions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_actions_agent_id_idx" ON "agent_actions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_runs_user_id_idx" ON "agent_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_runs_agent_id_idx" ON "agent_runs" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_runs_at_idx" ON "agent_runs" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "agents_user_id_idx" ON "agents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "approvals_user_id_idx" ON "approvals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "approvals_agent_id_idx" ON "approvals" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "commitments_user_id_idx" ON "commitments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "commitments_due_at_idx" ON "commitments" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE INDEX "reminders_user_id_idx" ON "reminders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reminders_due_at_idx" ON "reminders" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE INDEX "signatures_user_id_idx" ON "signatures" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "signatures_account_id_idx" ON "signatures" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "audit_log_user_id_idx" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "leads_user_id_idx" ON "leads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "usage_counters_user_id_idx" ON "usage_counters" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_counters_user_metric_period_uq" ON "usage_counters" USING btree ("user_id","metric","period");