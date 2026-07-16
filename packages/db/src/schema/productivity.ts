/**
 * Follow-through surfaces: reminders, tracked commitments, and per-account
 * signatures. Kinds/dates/counterparts are plaintext metadata; every piece of
 * derived or authored text (context, drafts, subjects, commitment text,
 * signature html) is ciphertext.
 */
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { createdAt, encrypted, timestamps } from './columns'
import { reminderKindEnum } from './enums'
import { accounts, users } from './identity'
import { threads } from './mail'

/** A reminder / follow-up nudge. Mirrors `Reminder`. */
export const reminders = pgTable(
  'reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: reminderKindEnum('kind').notNull(),
    threadId: uuid('thread_id').references(() => threads.id, { onDelete: 'cascade' }),
    /** Encrypted subject. */
    subjectCt: encrypted('subject_ct'),
    /** Encrypted context blurb (AI). */
    contextCt: encrypted('context_ct'),
    /** Sender display string (plaintext metadata). */
    sender: text('sender'),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    /** Encrypted suggested draft reply (AI). */
    draftReplyCt: encrypted('draft_reply_ct'),
    createdAt: createdAt(),
  },
  (t) => [
    index('reminders_user_id_idx').on(t.userId),
    index('reminders_due_at_idx').on(t.userId, t.dueAt),
  ],
)

/** A tracked promise/commitment surfaced from the inbox. Mirrors `Commitment`. */
export const commitments = pgTable(
  'commitments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Encrypted commitment text (AI). */
    textCt: encrypted('text_ct'),
    threadId: uuid('thread_id').references(() => threads.id, { onDelete: 'cascade' }),
    /** Encrypted subject. */
    subjectCt: encrypted('subject_ct'),
    /** Counterpart display string (plaintext metadata). */
    counterpart: text('counterpart'),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('commitments_user_id_idx').on(t.userId),
    index('commitments_due_at_idx').on(t.userId, t.dueAt),
  ],
)

/** A per-account signature. Label is plaintext; the html body is ciphertext. */
export const signatures = pgTable(
  'signatures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Encrypted signature HTML (user content). */
    htmlCt: encrypted('html_ct'),
    ...timestamps(),
  },
  (t) => [
    index('signatures_user_id_idx').on(t.userId),
    index('signatures_account_id_idx').on(t.accountId),
  ],
)
