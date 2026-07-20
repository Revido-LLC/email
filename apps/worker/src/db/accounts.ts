/**
 * Account credentials + per-user envelope crypto.
 *
 * `loadAccountContext` reads a connected account and its user's wrapped DEK
 * (service role), unwraps the DEK via the configured KMS, and decrypts the
 * stored OAuth tokens just-in-time into {@link ProviderCredentials}. The unwrapped
 * DEK is returned alongside so the caller can encrypt ingested content at rest
 * and decrypt it for enrichment — all under the same key.
 *
 * `saveCredentials` re-encrypts refreshed tokens after `adapter.connect(...)`.
 */

import {
  envelopeCrypto,
  type Ciphertext,
  type EnvelopeCrypto,
  type KmsProvider,
} from '@revido/db/crypto'
import type { ProviderCredentials } from '@revido/core'
import type { Provider } from '@revido/db'
import type { JsonValue, WorkerDb } from './client'

/** Encrypt/decrypt bound to one user's DEK. */
export interface AccountCrypto {
  encrypt(plaintext: string): Ciphertext
  decrypt(ciphertext: Ciphertext): string
}

export function accountCrypto(
  dek: Uint8Array,
  crypto: EnvelopeCrypto = envelopeCrypto,
): AccountCrypto {
  return {
    encrypt: (plaintext) => crypto.encrypt(plaintext, dek),
    decrypt: (ciphertext) => crypto.decrypt(ciphertext, dek),
  }
}

/** Everything a consumer needs to act on one account's mailbox. */
export interface AccountContext {
  accountId: string
  userId: string
  provider: Provider
  email: string
  dek: Uint8Array
  creds: ProviderCredentials
  crypto: AccountCrypto
}

interface AccountRow {
  user_id: string
  provider: Provider
  email: string
  access_token_ct: Ciphertext | null
  refresh_token_ct: Ciphertext | null
  /** postgres-js may return timestamptz as a Date or an ISO string. */
  token_expires_at: Date | string | null
  wrapped_dek: string
}

/** Normalize the runtime timestamp shape before handing credentials to adapters. */
export function tokenExpiryIso(value: Date | string | null): string {
  const date = value instanceof Date ? value : new Date(value ?? 0)
  if (Number.isNaN(date.getTime())) throw new Error('account has an invalid OAuth token expiry')
  return date.toISOString()
}

/** Load + decrypt an account's credentials and DEK. Throws if the account is unknown. */
export async function loadAccountContext(
  db: WorkerDb,
  accountId: string,
  kms: KmsProvider,
  crypto: EnvelopeCrypto = envelopeCrypto,
): Promise<AccountContext> {
  const rows = await db.asService(
    (sql) => sql<AccountRow[]>`
      select a.user_id, a.provider, a.email,
             a.access_token_ct, a.refresh_token_ct, a.token_expires_at,
             k.wrapped_dek
      from accounts a
      join user_keys k on k.user_id = a.user_id
      where a.id = ${accountId}
    `,
  )
  const row = rows[0]
  if (!row) throw new Error(`account not found: ${accountId}`)
  if (!row.access_token_ct || !row.refresh_token_ct) {
    throw new Error(`account ${accountId} has no stored OAuth tokens`)
  }

  const dek = await crypto.loadUserDek(row.wrapped_dek, kms)
  const creds: ProviderCredentials = {
    accessToken: crypto.decrypt(row.access_token_ct, dek),
    refreshToken: crypto.decrypt(row.refresh_token_ct, dek),
    expiresAt: tokenExpiryIso(row.token_expires_at),
  }

  return {
    accountId,
    userId: row.user_id,
    provider: row.provider,
    email: row.email,
    dek,
    creds,
    crypto: accountCrypto(dek, crypto),
  }
}

/** Identity + crypto for a user, resolved from `user_keys` (no account needed). */
export interface UserContext {
  userId: string
  dek: Uint8Array
  crypto: AccountCrypto
}

/**
 * Load + unwrap a user's DEK by user id, for the per-user jobs that are not
 * scoped to one connected account (`voice_profile`, `agent_run`, `chaser`).
 * The DEK is per-user (one `user_keys` row), so content across all the user's
 * accounts encrypts/decrypts under the same key. Throws if the user has no key.
 */
export async function loadUserContext(
  db: WorkerDb,
  userId: string,
  kms: KmsProvider,
  crypto: EnvelopeCrypto = envelopeCrypto,
): Promise<UserContext> {
  const rows = await db.asService(
    (sql) => sql<{ wrapped_dek: string }[]>`
      select wrapped_dek from user_keys where user_id = ${userId} limit 1
    `,
  )
  const row = rows[0]
  if (!row) throw new Error(`no user_keys row for user: ${userId}`)
  const dek = await crypto.loadUserDek(row.wrapped_dek, kms)
  return { userId, dek, crypto: accountCrypto(dek, crypto) }
}

/** Persist refreshed OAuth tokens (re-encrypted under the account's DEK). */
export async function saveCredentials(
  db: WorkerDb,
  account: AccountContext,
  creds: ProviderCredentials,
): Promise<void> {
  const accessCt = account.crypto.encrypt(creds.accessToken)
  const refreshCt = account.crypto.encrypt(creds.refreshToken)
  await db.asService(
    (sql) => sql`
      update accounts
      set access_token_ct = ${serializeCiphertext(accessCt)}::jsonb,
          refresh_token_ct = ${serializeCiphertext(refreshCt)}::jsonb,
          token_expires_at = ${new Date(creds.expiresAt).toISOString()},
          updated_at = now()
      where id = ${account.accountId}
    `,
  )
}

/**
 * A {@link Ciphertext} carried as a postgres `JSONValue` for a `sql.json(...)`
 * bind. `Ciphertext` has fixed keys (no index signature), so an explicit widen is
 * needed before the driver will accept it as JSON.
 */
export function jsonCiphertext(ciphertext: Ciphertext): JsonValue {
  return ciphertext as unknown as JsonValue
}

/**
 * Bind encrypted envelopes as JSON text with an explicit `::jsonb` cast.
 * postgres-js can otherwise receive a server-inferred text parameter for
 * `sql.json(object)` and attempt to write the object directly to its byte buffer.
 */
export function serializeCiphertext(ciphertext: Ciphertext): string {
  return JSON.stringify(jsonCiphertext(ciphertext))
}
