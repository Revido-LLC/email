/**
 * Envelope encryption — the shared crypto contract (W2 / W11).
 *
 * Per-user DEK (data encryption key) generated at signup, wrapped by a KMS
 * master key. Only the wrapped DEK is stored (in `user_keys`). Content is
 * encrypted with AES-256-GCM under the DEK; decryption happens only in the
 * audited api/worker path. Provable purge = delete the user's wrapped DEK ⇒ all
 * DEK-encrypted content is cryptographically unrecoverable.
 *
 * This stub freezes the interfaces so api/worker/enrichment agents can code the
 * decrypt path in parallel. The Wave 1 `db-schema` agent supplies the AES-GCM
 * implementation (Node `crypto`) and the KMS wrap/unwrap (dev-KMS AES key-wrap
 * behind the same interface; AWS KMS in prod — see Decisions).
 */

/** A value encrypted under a user's DEK. Base64 fields; safe to store as bytea/text. */
export interface Ciphertext {
  /** AES-256-GCM ciphertext, base64. */
  ct: string
  /** 96-bit nonce, base64. */
  iv: string
  /** GCM auth tag, base64. */
  tag: string
  /** Crypto scheme version, for rotation. */
  v: number
}

/** Pluggable master-key provider: AES key-wrap in dev, AWS KMS in prod. */
export interface KmsProvider {
  /** Wrap a raw 32-byte DEK, returning an opaque wrapped blob for storage. */
  wrapDek(dek: Uint8Array): Promise<string>
  /** Unwrap a stored wrapped DEK back to raw key bytes. */
  unwrapDek(wrapped: string): Promise<Uint8Array>
}

/** Envelope-crypto surface consumed by the server decrypt path. */
export interface EnvelopeCrypto {
  /** Generate a fresh random DEK for a new user. */
  generateDek(): Uint8Array
  encrypt(plaintext: string, dek: Uint8Array): Ciphertext
  decrypt(ciphertext: Ciphertext, dek: Uint8Array): string
  /** Load + unwrap a user's DEK via the configured KMS provider. */
  loadUserDek(wrappedDek: string, kms: KmsProvider): Promise<Uint8Array>
}

export const CRYPTO_SCHEME_VERSION = 1
