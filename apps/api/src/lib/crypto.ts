/**
 * Per-user envelope crypto, bound to a request.
 *
 * A protected handler resolves a {@link UserCrypto} once via {@link getUserCrypto}:
 * it reads the caller's KMS-wrapped DEK from `user_keys` (owner role, `asService`
 * — the table is never granted to `app_user`), unwraps it with the configured KMS
 * provider, and returns `encrypt`/`decrypt` closures bound to that DEK. Handlers
 * pass the {@link UserCrypto} to the row⇄DTO mappers so every `*Ct` (Ciphertext
 * jsonb) column is decrypted into the plaintext domain field and back.
 *
 * {@link ensureUserKey} provisions a fresh wrapped DEK the first time it is needed
 * (e.g. a user links their first mailbox), so the encrypt path never runs before a
 * key exists.
 *
 * Env: `DEV_KMS_MASTER_KEY` (base64) — the dev/CI KMS master key; a real KMS
 * provider drops in behind the same interface in prod.
 */
import { asService } from '@revido/db/client'
import {
  CRYPTO_SCHEME_VERSION,
  DevKmsProvider,
  envelopeCrypto,
  type Ciphertext,
} from '@revido/db/crypto'
import { userKeys } from '@revido/db/schema'
import { eq } from 'drizzle-orm'
import { HttpError } from './http'

/** Encrypt/decrypt bound to one user's DEK, handed to the row⇄DTO mappers. */
export interface UserCrypto {
  /** Encrypt a plaintext field into the stored {@link Ciphertext} envelope. */
  encrypt(plaintext: string): Ciphertext
  /** Decrypt a (nullable) ciphertext column; missing columns decrypt to `''`. */
  decrypt(ct: Ciphertext | null | undefined): string
  /** Like {@link decrypt} but returns `undefined` for a missing column. */
  decryptOptional(ct: Ciphertext | null | undefined): string | undefined
}

/** Build a {@link UserCrypto} over a raw DEK (also the seam unit tests exercise). */
export function makeUserCrypto(dek: Uint8Array): UserCrypto {
  return {
    encrypt: (plaintext) => envelopeCrypto.encrypt(plaintext, dek),
    decrypt: (ct) => (ct ? envelopeCrypto.decrypt(ct, dek) : ''),
    decryptOptional: (ct) => (ct ? envelopeCrypto.decrypt(ct, dek) : undefined),
  }
}

/** Load + unwrap the caller's DEK and return crypto bound to it. */
export async function getUserCrypto(
  userId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<UserCrypto> {
  const row = await asService(async (tx) => {
    const rows = await tx
      .select({ wrappedDek: userKeys.wrappedDek })
      .from(userKeys)
      .where(eq(userKeys.userId, userId))
      .limit(1)
    return rows.at(0)
  })
  if (!row) {
    throw new HttpError(409, 'user_key_missing', 'No encryption key is provisioned for this user.')
  }
  const kms = DevKmsProvider.fromEnv(env)
  const dek = await envelopeCrypto.loadUserDek(row.wrappedDek, kms)
  return makeUserCrypto(dek)
}

/**
 * Ensure the user has a wrapped DEK, generating + wrapping + storing one on first
 * use. Idempotent (a concurrent insert is a no-op via `onConflictDoNothing`).
 */
export async function ensureUserKey(
  userId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const kms = DevKmsProvider.fromEnv(env)
  const dek = envelopeCrypto.generateDek()
  const wrapped = await kms.wrapDek(dek)
  await asService(async (tx) => {
    await tx
      .insert(userKeys)
      .values({ userId, wrappedDek: wrapped, schemeVersion: CRYPTO_SCHEME_VERSION })
      .onConflictDoNothing()
  })
}
