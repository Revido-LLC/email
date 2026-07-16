/**
 * Better Auth configuration (Railway Postgres stack).
 *
 * Auth runs over the Drizzle client from `@revido/db` (the connection/owner role,
 * so Better Auth's own tables — which are RLS-locked to the service path — are
 * reachable). Ids are UUIDs to match the rest of the schema, and Better Auth's
 * `user` model is mapped onto the existing domain `users` table.
 *
 * Social sign-in requests offline access + the mail scopes so the linked-provider
 * `account` row carries refresh tokens; api-service later copies those, encrypted,
 * into the domain `accounts` mailbox table (see `onMailboxLinked`).
 *
 * Env vars (read lazily; nothing is hardcoded):
 *   BETTER_AUTH_SECRET   signing secret for sessions / tokens
 *   BETTER_AUTH_URL      the public base URL of this API (OAuth callback origin)
 *   GOOGLE_CLIENT_ID     Google OAuth client id
 *   GOOGLE_CLIENT_SECRET Google OAuth client secret
 *   MS_CLIENT_ID         Microsoft (Entra) OAuth client id
 *   MS_CLIENT_SECRET     Microsoft (Entra) OAuth client secret
 *   MS_TENANT_ID         Microsoft tenant (defaults to "common")
 */
import { randomUUID } from 'node:crypto'
import { getDb } from '@revido/db/client'
import {
  account,
  session,
  users,
  verification,
} from '@revido/db/schema'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'

/** Gmail scope that permits reading + modifying (send/label/trash) mail. */
const GOOGLE_MAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.modify']
/** Microsoft Graph mail scopes + offline access for a refresh token. */
const MS_MAIL_SCOPES = ['Mail.ReadWrite', 'Mail.Send', 'offline_access']

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(getDb(), {
    provider: 'pg',
    // Keys are the resolved model names: Better Auth's `user` model is mapped to
    // `users` below, the rest keep their singular names.
    schema: { users, session, account, verification },
  }),
  advanced: {
    database: {
      // UUIDs everywhere, to match the schema's uuid PKs and user_id FKs.
      generateId: () => randomUUID(),
    },
  },
  // Map Better Auth's `user` model onto the existing domain `users` table, and
  // its `image` field onto our `avatar_url` column.
  user: {
    modelName: 'users',
    fields: {
      image: 'avatarUrl',
    },
  },
  account: {
    // Let a user link both a Google and a Microsoft mailbox to one account.
    accountLinking: {
      enabled: true,
      trustedProviders: ['google', 'microsoft'],
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      accessType: 'offline',
      prompt: 'consent',
      scope: GOOGLE_MAIL_SCOPES,
    },
    microsoft: {
      clientId: process.env.MS_CLIENT_ID as string,
      clientSecret: process.env.MS_CLIENT_SECRET as string,
      tenantId: process.env.MS_TENANT_ID ?? 'common',
      prompt: 'consent',
      scope: MS_MAIL_SCOPES,
    },
  },
  // databaseHooks/after: api-service wires: on account link → encrypt tokens into
  // domain accounts + enqueue backfill. The seam is `onMailboxLinked` below.
})

/** The provider linkage Better Auth persists in its `account` row. */
export interface ProviderAccount {
  /** Provider key, e.g. "google" | "microsoft". */
  providerId: string
  /** Provider-native account id (e.g. Google `sub`). */
  accountId: string
  accessToken?: string | null
  refreshToken?: string | null
  idToken?: string | null
  scope?: string | null
  accessTokenExpiresAt?: Date | null
  refreshTokenExpiresAt?: Date | null
}

/**
 * Seam for api-service: called when a mailbox provider is linked to a user.
 * api-service implements this to encrypt the OAuth tokens into the domain
 * `accounts` table and enqueue an initial backfill job. Left unimplemented here
 * (auth-persistence owns only the skeleton).
 */
export type OnMailboxLinked = (
  userId: string,
  providerAccount: ProviderAccount,
) => Promise<void>

export type Auth = typeof auth
