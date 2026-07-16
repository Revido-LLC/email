/**
 * The mail core: threads and messages, their normalized participants/recipients,
 * attachments, AI-extracted facts and badges, and per-message embeddings.
 *
 * Ciphertext vs plaintext, per the storage-at-rest boundary:
 *  - CIPHERTEXT (content, under the user DEK): subjects, message bodies (raw +
 *    sanitized html + text), attachment storage refs, all AI-derived text
 *    (tldr, summary, extracted-fact label/value/href, badge labels).
 *  - PLAINTEXT (queryable metadata): ids, provider refs, timestamps, category,
 *    priority + score, flags/counts, labels, language, contact references.
 */
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { createdAt, encrypted, timestamps, vector } from './columns'
import {
  attachmentKindEnum,
  categoryEnum,
  extractedFactTypeEnum,
  priorityEnum,
  recipientKindEnum,
  threadBadgeKindEnum,
} from './enums'
import { accounts, contacts, users } from './identity'

/** A conversation thread. Subject and AI summaries are ciphertext. */
export const threads = pgTable(
  'threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    /** Provider-native thread id (plaintext cursor). */
    providerThreadId: text('provider_thread_id'),
    /** Encrypted subject. */
    subjectCt: encrypted('subject_ct'),
    category: categoryEnum('category').notNull(),
    priority: priorityEnum('priority').notNull().default('normal'),
    /** 0–100; drives the Focused Inbox sort. */
    priorityScore: integer('priority_score').notNull().default(0),
    /** Encrypted one-line TL;DR (AI). */
    tldrCt: encrypted('tldr_ct'),
    /** Encrypted long summary (AI). */
    summaryCt: encrypted('summary_ct'),
    unread: boolean('unread').notNull().default(true),
    starred: boolean('starred').notNull().default(false),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
    hasAttachments: boolean('has_attachments').notNull().default(false),
    awaitingReply: boolean('awaiting_reply').notNull().default(false),
    /** Freeform labels (plaintext). */
    labels: text('labels').array().notNull().default([]),
    /** Detected content language (plaintext, set by triage). */
    language: text('language'),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (t) => [
    index('threads_user_id_idx').on(t.userId),
    index('threads_account_id_idx').on(t.accountId),
    index('threads_category_idx').on(t.userId, t.category),
    index('threads_last_message_at_idx').on(t.userId, t.lastMessageAt),
  ],
)

/** Thread ⇄ contact participation. `user_id` is denormalized for RLS. */
export const threadParticipants = pgTable(
  'thread_participants',
  {
    threadId: uuid('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.threadId, t.contactId] }),
    index('thread_participants_contact_idx').on(t.contactId),
    index('thread_participants_user_idx').on(t.userId),
  ],
)

/** A single message. All body variants are ciphertext; the sender is a contact ref. */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    /** Provider-native message id (plaintext cursor). */
    providerMessageId: text('provider_message_id'),
    /** Sender (contact ref; plaintext identity metadata). */
    fromContactId: uuid('from_contact_id').references(() => contacts.id, {
      onDelete: 'set null',
    }),
    date: timestamp('date', { withTimezone: true }).notNull(),
    /** Encrypted raw provider HTML. */
    rawHtmlCt: encrypted('raw_html_ct'),
    /** Encrypted sanitized HTML (safe to render in a sandboxed iframe). */
    htmlCt: encrypted('html_ct'),
    /** Encrypted plaintext body. */
    textCt: encrypted('text_ct'),
    unread: boolean('unread').notNull().default(true),
    outbound: boolean('outbound').notNull().default(false),
    imagesBlocked: boolean('images_blocked').notNull().default(false),
    /** Detected content language (plaintext). */
    language: text('language'),
    ...timestamps(),
  },
  (t) => [
    index('messages_user_id_idx').on(t.userId),
    index('messages_thread_id_idx').on(t.threadId),
    index('messages_account_id_idx').on(t.accountId),
    index('messages_date_idx').on(t.threadId, t.date),
  ],
)

/** Message ⇄ contact recipients (to/cc/bcc). `user_id` denormalized for RLS. */
export const messageRecipients = pgTable(
  'message_recipients',
  {
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    kind: recipientKindEnum('kind').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.messageId, t.contactId, t.kind] }),
    index('message_recipients_contact_idx').on(t.contactId),
    index('message_recipients_user_idx').on(t.userId),
  ],
)

/**
 * Attachments. Display metadata (name, size, mime, kind) is plaintext; the
 * Storage object reference and any inline content are ciphertext.
 */
export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Human-readable size, e.g. "2.4 MB" (plaintext). */
    size: text('size'),
    /** Exact byte count (plaintext). */
    sizeBytes: integer('size_bytes'),
    mime: text('mime'),
    kind: attachmentKindEnum('kind').notNull().default('other'),
    /** Encrypted Supabase Storage object path/ref. */
    storageRefCt: encrypted('storage_ref_ct'),
    /** Optional encrypted inline content (small attachments). */
    contentCt: encrypted('content_ct'),
    createdAt: createdAt(),
  },
  (t) => [
    index('attachments_user_id_idx').on(t.userId),
    index('attachments_message_id_idx').on(t.messageId),
  ],
)

/** AI-extracted structured facts. Type/done are plaintext; label/value/href are ciphertext. */
export const extractedFacts = pgTable(
  'extracted_facts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    type: extractedFactTypeEnum('type').notNull(),
    /** Encrypted display label (AI). */
    labelCt: encrypted('label_ct'),
    /** Encrypted value (AI). */
    valueCt: encrypted('value_ct'),
    /** Encrypted href for link/action facts (AI). */
    hrefCt: encrypted('href_ct'),
    done: boolean('done').notNull().default(false),
    /** Ordering within the thread. */
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index('extracted_facts_user_id_idx').on(t.userId),
    index('extracted_facts_thread_id_idx').on(t.threadId),
  ],
)

/** AI-generated thread badges. Kind is plaintext; the label is ciphertext (may be content). */
export const threadBadges = pgTable(
  'thread_badges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    kind: threadBadgeKindEnum('kind').notNull(),
    /** Encrypted badge label (AI, may embed amounts/dates). */
    labelCt: encrypted('label_ct'),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index('thread_badges_user_id_idx').on(t.userId),
    index('thread_badges_thread_id_idx').on(t.threadId),
  ],
)

/**
 * Per-message embeddings for semantic search (pgvector). The vector itself is
 * plaintext by necessity — pgvector must index it for ANN search. The HNSW index
 * is added in the extensions/index migration.
 */
export const messageEmbeddings = pgTable(
  'message_embeddings',
  {
    messageId: uuid('message_id')
      .primaryKey()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 1024-dim embedding vector. */
    embedding: vector('embedding', { dimensions: 1024 }).notNull(),
    /** Embedding model id (plaintext). */
    model: text('model'),
    createdAt: createdAt(),
  },
  (t) => [index('message_embeddings_user_id_idx').on(t.userId)],
)
