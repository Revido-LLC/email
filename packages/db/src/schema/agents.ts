/**
 * Agents and their activity: agent definitions, their action rows, run history,
 * and the human-approval queue.
 *
 * Agent *configuration* (name, trigger, conditions) is user-authored settings —
 * plaintext, so it can be listed and edited. Run *output* that describes email
 * content (summaries, reasoning, affected-thread snapshots, previews) is
 * ciphertext.
 */
import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { createdAt, encrypted, timestamps } from './columns'
import { agentRunStatusEnum } from './enums'
import { users } from './identity'
import { threads } from './mail'

/** Agent definition (config). Mirrors `AgentDef`; all fields are plaintext settings. */
export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    icon: text('icon'),
    accent: text('accent'),
    enabled: boolean('enabled').notNull().default(true),
    trigger: text('trigger'),
    /** Human-readable condition clauses (plaintext config). */
    conditions: text('conditions').array().notNull().default([]),
    runCount: integer('run_count').notNull().default(0),
    affectedCount: integer('affected_count').notNull().default(0),
    prebuilt: boolean('prebuilt').notNull().default(false),
    ...timestamps(),
  },
  (t) => [index('agents_user_id_idx').on(t.userId)],
)

/** An action an agent can take. Mirrors `AgentAction`. */
export const agentActions = pgTable(
  'agent_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    label: text('label').notNull(),
    needsApproval: boolean('needs_approval').notNull().default(false),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    index('agent_actions_user_id_idx').on(t.userId),
    index('agent_actions_agent_id_idx').on(t.agentId),
  ],
)

/**
 * A single agent run. Denormalized agent name/icon are a display snapshot
 * (plaintext); the summary, reasoning, and affected-thread snapshot describe
 * email content and are ciphertext. `affected` is `JSON.stringify`d then
 * encrypted into a single Ciphertext in `affected_ct`.
 */
export const agentRuns = pgTable(
  'agent_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    agentName: text('agent_name'),
    agentIcon: text('agent_icon'),
    at: timestamp('at', { withTimezone: true }).notNull(),
    /** Encrypted run summary (AI). */
    summaryCt: encrypted('summary_ct'),
    /** Encrypted reasoning (AI). */
    reasoningCt: encrypted('reasoning_ct'),
    /** Encrypted `{threadId, subject, sender}[]` snapshot (JSON then encrypted). */
    affectedCt: encrypted('affected_ct'),
    status: agentRunStatusEnum('status').notNull().default('done'),
    reversible: boolean('reversible').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('agent_runs_user_id_idx').on(t.userId),
    index('agent_runs_agent_id_idx').on(t.agentId),
    index('agent_runs_at_idx').on(t.userId, t.at),
  ],
)

/**
 * The human-approval queue: an agent action awaiting sign-off. Action type and
 * sender are plaintext metadata; subject and preview are ciphertext.
 */
export const approvals = pgTable(
  'approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    agentName: text('agent_name'),
    agentIcon: text('agent_icon'),
    action: text('action').notNull(),
    threadId: uuid('thread_id').references(() => threads.id, { onDelete: 'cascade' }),
    /** Encrypted subject. */
    subjectCt: encrypted('subject_ct'),
    /** Sender display string (plaintext metadata). */
    sender: text('sender'),
    /** Encrypted action preview (AI). */
    previewCt: encrypted('preview_ct'),
    createdAt: createdAt(),
  },
  (t) => [
    index('approvals_user_id_idx').on(t.userId),
    index('approvals_agent_id_idx').on(t.agentId),
  ],
)
