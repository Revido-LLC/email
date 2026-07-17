import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../drizzle/${name}`, import.meta.url)), 'utf8')

const rls = read('0001_rls_policies.sql')
const authJobs = read('0002_auth_jobs.sql')
const attachmentsPending = read('0004_attachments_pending.sql')

describe('0001 RLS migration (plain Postgres + GUC)', () => {
  it('creates the non-owner app_user role and grants it schema/table access', () => {
    expect(rls).toContain('CREATE ROLE app_user NOLOGIN')
    expect(rls).toContain('GRANT USAGE ON SCHEMA "public" TO "app_user"')
    expect(rls).toContain('ON ALL TABLES IN SCHEMA "public" TO "app_user"')
    expect(rls).toContain('ALTER DEFAULT PRIVILEGES')
  })

  it('scopes policies with current_setting(\'app.user_id\')::uuid, not auth.uid()', () => {
    expect(rls).toContain("current_setting('app.user_id', true)::uuid")
    expect(rls).toContain('CREATE POLICY "users_self"')
    expect(rls).toContain('CREATE POLICY "threads_owner"')
    expect(rls).toContain('TO "app_user"')
  })

  it('drops every Supabase-ism (auth.*, pgmq, pg_cron)', () => {
    expect(rls).not.toContain('auth.uid()')
    expect(rls).not.toContain('auth.users')
    expect(rls).not.toContain('pgmq')
    expect(rls).not.toContain('pg_cron')
    expect(rls).not.toContain('TO authenticated')
  })

  it('keeps user_keys service-only and audit_log append-only', () => {
    expect(rls).toContain('REVOKE ALL PRIVILEGES ON TABLE "user_keys" FROM "app_user"')
    expect(rls).toContain('REVOKE INSERT, UPDATE, DELETE ON TABLE "audit_log" FROM "app_user"')
    expect(rls).toContain('audit_log_no_mutation')
  })

  it('keeps the pgvector HNSW index', () => {
    expect(rls).toContain('message_embeddings_embedding_hnsw')
    expect(rls).toContain('vector_cosine_ops')
  })
})

describe('0002 auth + jobs migration', () => {
  it('creates the Better Auth tables and the jobs queue', () => {
    for (const table of ['account', 'session', 'verification', 'jobs']) {
      expect(authJobs).toContain(`CREATE TABLE "${table}"`)
    }
    expect(authJobs).toContain('ALTER TABLE "users" ADD COLUMN "email_verified"')
    expect(authJobs).toContain('"jobs_queue_status_run_at_idx"')
  })

  it('locks the service-only tables away from app_user', () => {
    for (const table of ['session', 'account', 'verification', 'jobs']) {
      expect(authJobs).toContain(`REVOKE ALL PRIVILEGES ON TABLE "${table}" FROM "app_user"`)
      expect(authJobs).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`)
    }
  })
})

describe('0004 attachments pending migration', () => {
  it('makes message_id nullable so a pending upload can exist before its message', () => {
    expect(attachmentsPending).toContain(
      'ALTER TABLE "attachments" ALTER COLUMN "message_id" DROP NOT NULL',
    )
  })

  it('adds the (user_id, message_id) index for pending lookups', () => {
    expect(attachmentsPending).toContain(
      'CREATE INDEX "attachments_user_message_idx" ON "attachments" USING btree ("user_id","message_id")',
    )
  })
})
