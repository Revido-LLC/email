/**
 * Operational tables: sales-lead capture, usage metering, and the append-only
 * audit log.
 *
 * These hold operational/marketing metadata, not mailbox content, so nothing here
 * is encrypted. `audit_log` is append-only: RLS lets a user read their own rows
 * but grants no insert/update/delete to end users, and a trigger (see the RLS
 * migration) blocks UPDATE/DELETE outright — only the service role appends.
 */
import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { createdAt, timestamps } from './columns'
import { leadStatusEnum } from './enums'
import { users } from './identity'

/**
 * "Talk to Revido" sales leads (IA S12). Captured from in-app CTAs; `user_id` is
 * the submitting user when logged in (nullable for anonymous capture). RLS scopes
 * a user to their own submissions; the service role reads the full funnel.
 */
export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    email: text('email').notNull(),
    name: text('name'),
    company: text('company'),
    /** Free-text message from the prefilled lead form. */
    message: text('message'),
    /** Which CTA/screen sourced the lead (e.g. "s8-agents", "zero-state"). */
    source: text('source'),
    status: leadStatusEnum('status').notNull().default('new'),
    ...timestamps(),
  },
  (t) => [index('leads_user_id_idx').on(t.userId), index('leads_status_idx').on(t.status)],
)

/**
 * Per-user usage counters for metering (AI enrichments, sends, agent runs…),
 * bucketed by a period key (e.g. "2026-07"). All plaintext.
 */
export const usageCounters = pgTable(
  'usage_counters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Metric name, e.g. "ai_enrichments", "sends", "agent_runs". */
    metric: text('metric').notNull(),
    /** Bucket key, e.g. an ISO month "2026-07". */
    period: text('period').notNull(),
    count: bigint('count', { mode: 'number' }).notNull().default(0),
    windowStart: timestamp('window_start', { withTimezone: true }),
    windowEnd: timestamp('window_end', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index('usage_counters_user_id_idx').on(t.userId),
    uniqueIndex('usage_counters_user_metric_period_uq').on(t.userId, t.metric, t.period),
  ],
)

/**
 * Append-only audit log. Records every sensitive action (decrypt, send,
 * agent.run, key.purge…). `metadata` holds non-sensitive context only. Never
 * updated or deleted (enforced by RLS + trigger).
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Whose data the action touched. Intentionally NOT a foreign key: the audit
     * trail is append-only and must survive user deletion/purge, so it must not
     * be mutated by an FK cascade (which the append-only trigger would block).
     */
    userId: uuid('user_id'),
    /** Who acted: "user", a service name, or an agent id. */
    actor: text('actor').notNull(),
    /** Action verb, e.g. "decrypt", "send", "agent.run", "key.purge". */
    action: text('action').notNull(),
    resourceType: text('resource_type'),
    resourceId: text('resource_id'),
    /** Non-sensitive structured context (plaintext). */
    metadata: jsonb('metadata'),
    at: createdAt(),
  },
  (t) => [
    index('audit_log_user_id_idx').on(t.userId),
    index('audit_log_at_idx').on(t.at),
    index('audit_log_action_idx').on(t.action),
  ],
)
