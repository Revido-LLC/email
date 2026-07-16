/**
 * Drizzle schema — Postgres tables for Revido Mail (W2).
 *
 * Filled in by the Wave 1 `db-schema` agent: users, accounts, contacts, threads,
 * messages, attachments, extracted_facts, thread_badges, agents, agent_actions,
 * agent_runs, approvals, reminders, commitments, signatures, leads,
 * usage_counters, sync_state, user_keys, message_embeddings (pgvector),
 * audit_log (append-only). Categories are an enum of the locked 9. RLS on every
 * user-scoped table (`auth.uid()`). DEK-encrypted columns store `Ciphertext`
 * (see ./crypto); plaintext metadata stays queryable.
 *
 * This stub keeps `@revido/db/schema` resolvable while the schema lands.
 */
export {}
