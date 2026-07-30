/**
 * Scape-parity product domains.
 *
 * Mailbox and meeting content remains owned by an individual user even when the
 * user belongs to a workspace. Workspaces provide billing, policy and identity
 * boundaries; sharing content is always an explicit future action.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { createdAt, encrypted, timestamps, vector } from './columns'
import { accounts, users } from './identity'
import { threads } from './mail'

/** Team/billing boundary. Content is not implicitly shared within a workspace. */
export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    plan: text('plan').notNull().default('trial'),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    subscriptionStatus: text('subscription_status'),
    retentionDays: integer('retention_days').notNull().default(365),
    featureFlags: jsonb('feature_flags').$type<Record<string, boolean>>().notNull().default({}),
    aiPolicy: jsonb('ai_policy')
      .$type<{ drafts: boolean; chat: boolean; meetings: boolean; artifacts: boolean }>()
      .notNull()
      .default({ drafts: true, chat: true, meetings: true, artifacts: false }),
    supportContact: text('support_contact'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('workspaces_slug_uq').on(t.slug),
    index('workspaces_owner_user_id_idx').on(t.ownerUserId),
    uniqueIndex('workspaces_stripe_customer_uq').on(t.stripeCustomerId),
  ],
)

export const workspaceMemberships = pgTable(
  'workspace_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    status: text('status').notNull().default('active'),
    invitedEmail: text('invited_email'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('workspace_memberships_workspace_user_uq').on(t.workspaceId, t.userId),
    index('workspace_memberships_user_id_idx').on(t.userId),
  ],
)

/** Calendar access reuses the mailbox OAuth grant stored on `accounts`. */
export const calendarAccounts = pgTable(
  'calendar_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    externalCalendarId: text('external_calendar_id').notNull().default('primary'),
    syncTokenCt: encrypted('sync_token_ct'),
    enabled: boolean('enabled').notNull().default(true),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('calendar_accounts_account_calendar_uq').on(
      t.accountId,
      t.externalCalendarId,
    ),
    index('calendar_accounts_user_id_idx').on(t.userId),
  ],
)

export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    calendarAccountId: uuid('calendar_account_id')
      .notNull()
      .references(() => calendarAccounts.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    titleCt: encrypted('title_ct'),
    descriptionCt: encrypted('description_ct'),
    locationCt: encrypted('location_ct'),
    joinUrlCt: encrypted('join_url_ct'),
    attendeesCt: encrypted('attendees_ct'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    timezone: text('timezone'),
    status: text('status').notNull().default('confirmed'),
    recurringEventId: text('recurring_event_id'),
    etag: text('etag'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('calendar_events_account_external_uq').on(t.calendarAccountId, t.externalId),
    index('calendar_events_user_starts_at_idx').on(t.userId, t.startsAt),
  ],
)

export const meetings = pgTable(
  'meetings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'set null',
    }),
    calendarEventId: uuid('calendar_event_id').references(() => calendarEvents.id, {
      onDelete: 'set null',
    }),
    titleCt: encrypted('title_ct'),
    status: text('status').notNull().default('queued'),
    source: text('source').notNull().default('web'),
    meetingProvider: text('meeting_provider'),
    recordingMode: text('recording_mode').notNull().default('tab-and-mic'),
    language: text('language'),
    durationMs: integer('duration_ms'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    rawAudioRefCt: encrypted('raw_audio_ref_ct'),
    rawAudioDeleteAfter: timestamp('raw_audio_delete_after', { withTimezone: true }),
    errorCode: text('error_code'),
    consentAcknowledgedAt: timestamp('consent_acknowledged_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index('meetings_user_started_at_idx').on(t.userId, t.startedAt),
    index('meetings_user_status_idx').on(t.userId, t.status),
  ],
)

export const meetingParticipants = pgTable(
  'meeting_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    participantCt: encrypted('participant_ct'),
    isOrganizer: boolean('is_organizer').notNull().default(false),
    ...timestamps(),
  },
  (t) => [index('meeting_participants_meeting_idx').on(t.meetingId)],
)

export const transcriptSegments = pgTable(
  'transcript_segments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    startsAtMs: integer('starts_at_ms').notNull(),
    endsAtMs: integer('ends_at_ms').notNull(),
    speakerCt: encrypted('speaker_ct'),
    textCt: encrypted('text_ct'),
    language: text('language'),
    confidence: real('confidence'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('transcript_segments_meeting_sequence_uq').on(t.meetingId, t.sequence),
    index('transcript_segments_user_id_idx').on(t.userId),
  ],
)

export const meetingSummaries = pgTable(
  'meeting_summaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    summaryCt: encrypted('summary_ct'),
    decisionsCt: encrypted('decisions_ct'),
    questionsCt: encrypted('questions_ct'),
    actionItemsCt: encrypted('action_items_ct'),
    model: text('model'),
    ...timestamps(),
  },
  (t) => [uniqueIndex('meeting_summaries_meeting_uq').on(t.meetingId)],
)

/** Resumable upload ledger. Object references are encrypted under the user DEK. */
export const recordingChunks = pgTable(
  'recording_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    checksum: text('checksum').notNull(),
    storageRefCt: encrypted('storage_ref_ct'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('recording_chunks_meeting_sequence_uq').on(t.meetingId, t.sequence),
    index('recording_chunks_user_id_idx').on(t.userId),
  ],
)

export const customLabels = pgTable(
  'custom_labels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    descriptionCt: encrypted('description_ct'),
    color: text('color').notNull().default('blue'),
    icon: text('icon').notNull().default('tag'),
    priority: integer('priority').notNull().default(50),
    enabled: boolean('enabled').notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('custom_labels_user_name_uq').on(t.userId, t.name),
    index('custom_labels_user_priority_idx').on(t.userId, t.priority),
  ],
)

export const threadCustomLabels = pgTable(
  'thread_custom_labels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    labelId: uuid('label_id')
      .notNull()
      .references(() => customLabels.id, { onDelete: 'cascade' }),
    confidence: real('confidence'),
    correctedByUser: boolean('corrected_by_user').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('thread_custom_labels_thread_label_uq').on(t.threadId, t.labelId),
    index('thread_custom_labels_user_id_idx').on(t.userId),
  ],
)

export const artifacts = pgTable(
  'artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    mime: text('mime').notNull(),
    status: text('status').notNull().default('draft'),
    sourceAttachmentId: uuid('source_attachment_id'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('artifacts_user_updated_at_idx').on(t.userId, t.updatedAt)],
)

export const artifactVersions = pgTable(
  'artifact_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    artifactId: uuid('artifact_id')
      .notNull()
      .references(() => artifacts.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    contentCt: encrypted('content_ct'),
    storageRefCt: encrypted('storage_ref_ct'),
    instructionCt: encrypted('instruction_ct'),
    sizeBytes: integer('size_bytes').notNull(),
    checksum: text('checksum').notNull(),
    scanStatus: text('scan_status').notNull().default('pending'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('artifact_versions_artifact_version_uq').on(t.artifactId, t.version),
    index('artifact_versions_user_id_idx').on(t.userId),
  ],
)

/** One ANN index for email, meeting, calendar and artifact chunks. */
export const contentEmbeddings = pgTable(
  'content_embeddings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    chunkIndex: integer('chunk_index').notNull().default(0),
    contentCt: encrypted('content_ct'),
    embedding: vector('embedding', { dimensions: 1024 }).notNull(),
    model: text('model').notNull(),
    metadata: jsonb('metadata').$type<Record<string, string | number | boolean | null>>(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('content_embeddings_source_chunk_uq').on(
      t.userId,
      t.sourceType,
      t.sourceId,
      t.chunkIndex,
    ),
    index('content_embeddings_user_source_idx').on(t.userId, t.sourceType),
  ],
)

/** Stripe webhook idempotency ledger; service-role only. */
export const billingEvents = pgTable('billing_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  livemode: boolean('livemode').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  error: text('error'),
  createdAt: createdAt(),
})
