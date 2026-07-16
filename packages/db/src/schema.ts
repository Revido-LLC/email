/**
 * Drizzle schema — Postgres tables for Revido Mail (W2).
 *
 * The `@revido/db/schema` entrypoint. Tables are grouped under `./schema/*` and
 * re-exported here so callers can `import { threads } from '@revido/db/schema'`.
 *
 * Layout:
 *  - enums        — the locked, queryable vocabularies (category, priority, …).
 *  - columns      — custom types: `encrypted(...)` (Ciphertext jsonb) + `vector`.
 *  - identity     — users, user_keys, accounts, contacts, sync_state.
 *  - mail         — threads, messages, their participants/recipients,
 *                   attachments, extracted_facts, thread_badges, message_embeddings.
 *  - agents       — agents, agent_actions, agent_runs, approvals.
 *  - productivity — reminders, commitments, signatures.
 *  - system       — leads, usage_counters, audit_log.
 *  - auth         — Better Auth session, account, verification (user → users).
 *  - jobs         — the background job queue (replaces pgmq).
 *
 * Storage-at-rest boundary: `*Ct` columns hold DEK-encrypted `Ciphertext`
 * (bodies, subjects, all AI-derived text, OAuth tokens). Everything else is
 * plaintext metadata and is queryable. RLS on every user-scoped table
 * (`user_id = auth.uid()`) lands in the migrations under `./migrations`.
 *
 * Row types are available via `typeof <table>.$inferSelect` / `$inferInsert`;
 * DTO validators live in `@revido/db/zod`.
 */
export * from './schema/enums'
export * from './schema/columns'
export * from './schema/identity'
export * from './schema/mail'
export * from './schema/agents'
export * from './schema/productivity'
export * from './schema/system'
export * from './schema/auth'
export * from './schema/jobs'
