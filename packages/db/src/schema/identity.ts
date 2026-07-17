/**
 * Identity + connection tables: users, wrapped DEKs, provider accounts,
 * the per-user contact book, and per-account sync cursors.
 */
import {
  boolean,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { createdAt, encrypted, timestamps } from './columns'
import { outputLanguageEnum, providerEnum } from './enums'

/**
 * Application users. This IS Better Auth's `user` model (mapped via
 * `user.modelName = 'users'`); Better Auth writes it through the service path,
 * and GUC RLS compares `id = current_setting('app.user_id')::uuid`. Email/name
 * are plaintext identity metadata.
 *
 * `emailVerified` is required by Better Auth. Better Auth's `image` field is
 * mapped onto the existing `avatar_url` column (`user.fields.image = 'avatarUrl'`),
 * so no separate `image` column is added. `outputLanguage` / `voiceProfileCt`
 * are Revido-specific additional fields Better Auth ignores.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  /** Better Auth: whether the user's email has been verified. */
  emailVerified: boolean('email_verified').notNull().default(false),
  /** Preferred output language for AI artifacts (W5). */
  outputLanguage: outputLanguageEnum('output_language').notNull().default('match'),
  /** Encrypted learned writing-voice profile used to draft "in your voice" (AI). */
  voiceProfileCt: encrypted('voice_profile_ct'),
  ...timestamps(),
})

/**
 * Wrapped data-encryption keys — the root of the encryption-at-rest scheme and
 * the provable-purge lever. One row per user holds the user's DEK, wrapped by the
 * KMS master key; only the wrapped blob is ever persisted. Deleting this row
 * renders every DEK-encrypted column cryptographically unrecoverable (see
 * `purgeUserKey` in `../crypto`).
 */
export const userKeys = pgTable('user_keys', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** KMS-wrapped DEK, opaque base64 blob. */
  wrappedDek: text('wrapped_dek').notNull(),
  /** Crypto scheme version for rotation (see CRYPTO_SCHEME_VERSION). */
  schemeVersion: integer('scheme_version').notNull().default(1),
  createdAt: createdAt(),
  rotatedAt: timestamp('rotated_at', { withTimezone: true }),
})

/**
 * Connected mailbox accounts. OAuth tokens are ciphertext under the user DEK;
 * provider, email, sync progress and token expiry are plaintext (queried/shown).
 */
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: providerEnum('provider').notNull(),
    email: text('email').notNull(),
    name: text('name'),
    avatarUrl: text('avatar_url'),
    /** Encrypted OAuth access token. */
    accessTokenCt: encrypted('access_token_ct'),
    /** Encrypted OAuth refresh token. */
    refreshTokenCt: encrypted('refresh_token_ct'),
    /** Access-token expiry (plaintext, drives refresh scheduling). */
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    /** Granted OAuth scopes (plaintext). */
    scopes: text('scopes').array(),
    /** Backfill progress 0–1; 1 = fully synced. */
    syncProgress: real('sync_progress').notNull().default(0),
    syncLabel: text('sync_label'),
    ...timestamps(),
  },
  (t) => [
    index('accounts_user_id_idx').on(t.userId),
    uniqueIndex('accounts_user_provider_email_uq').on(t.userId, t.provider, t.email),
  ],
)

/**
 * Per-user contact book (NORMALIZED). Threads and messages reference contacts by
 * id via `thread_participants` / `message_recipients` and `messages.from_contact_id`
 * instead of inlining the address. Email/name are plaintext identity metadata.
 */
export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name'),
    avatarUrl: text('avatar_url'),
    ...timestamps(),
  },
  (t) => [
    index('contacts_user_id_idx').on(t.userId),
    uniqueIndex('contacts_user_email_uq').on(t.userId, t.email),
  ],
)

/**
 * Per-account sync state: provider cursors and backfill progress. Cursors
 * (`history_id`, `delta_link`) are plaintext provider metadata.
 */
export const syncState = pgTable(
  'sync_state',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    provider: providerEnum('provider').notNull(),
    /** Gmail historyId cursor. */
    historyId: text('history_id'),
    /** Microsoft Graph delta link cursor. */
    deltaLink: text('delta_link'),
    /**
     * Provider push subscription/watch id (Graph subscription id, Gmail watch id).
     * Persisted so a webhook push — which carries no account id — can resolve the
     * account it belongs to (Outlook resolves by this id).
     */
    subscriptionId: text('subscription_id'),
    /** Cursor for the initial backfill scan. */
    backfillCursor: text('backfill_cursor'),
    backfillComplete: boolean('backfill_complete').notNull().default(false),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    status: text('status'),
    ...timestamps(),
  },
  (t) => [
    index('sync_state_user_id_idx').on(t.userId),
    uniqueIndex('sync_state_account_uq').on(t.accountId),
  ],
)
