/**
 * Better Auth tables (Railway Postgres + Better Auth stack).
 *
 * Better Auth needs four models: `user`, `session`, `account`, `verification`.
 * The `user` model is mapped onto the existing `users` table (see
 * `./identity.ts` + `apps/api/src/auth.ts`), so only the other three live here.
 *
 * These are SERVICE-ACCESSED tables: the Better Auth Drizzle adapter reaches them
 * over the connection (owner) role via `asService` / `getDb()`. They are NOT
 * granted to `app_user` and carry no GUC RLS policy (see the RLS migration).
 *
 * The JS property keys below are load-bearing: the Drizzle adapter looks up
 * columns by Better Auth's field name (`schemaModel[fieldName]`), so each key must
 * match Better Auth's default field name exactly. Column names are snake_case to
 * match the rest of the schema. `account` here is Better Auth's linked-provider
 * record — distinct from the domain `accounts` mailbox table in `./identity.ts`.
 */
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { timestamps } from './columns'
import { users } from './identity'

/** Better Auth `session` — an authenticated browser session (bearer token). */
export const session = pgTable(
  'session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Opaque session token (unique). */
    token: text('token').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    ...timestamps(),
  },
  (t) => [uniqueIndex('session_token_uq').on(t.token), index('session_user_id_idx').on(t.userId)],
)

/**
 * Better Auth `account` — a linked authentication provider for a user. Holds the
 * provider OAuth tokens Better Auth issues; the mail-scoped tokens are copied,
 * encrypted, into the domain `accounts` table by api-service on link.
 */
export const account = pgTable(
  'account',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Provider-native account id (e.g. Google `sub`). */
    accountId: text('account_id').notNull(),
    /** Provider key: 'google' | 'microsoft' | 'credential'. */
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    /** Password hash for the email/password provider (unused for social-only). */
    password: text('password'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('account_provider_account_uq').on(t.providerId, t.accountId),
    index('account_user_id_idx').on(t.userId),
  ],
)

/** Better Auth `verification` — short-lived verification/OTP tokens. */
export const verification = pgTable(
  'verification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
)
