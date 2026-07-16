/**
 * Envelope encryption — the shared crypto contract (W2 / W11).
 *
 * Per-user DEK (data encryption key) generated at signup, wrapped by a KMS
 * master key. Only the wrapped DEK is stored (in `user_keys`). Content is
 * encrypted with AES-256-GCM under the DEK; decryption happens only in the
 * audited api/worker path. Provable purge = delete the user's wrapped DEK ⇒ all
 * DEK-encrypted content is cryptographically unrecoverable.
 *
 * Implementation notes:
 *  - Content encryption: AES-256-GCM, fresh random 96-bit IV per message,
 *    16-byte auth tag. Fields are base64. Wrong DEK or tampered ciphertext throws
 *    on decrypt (GCM auth failure) — it never returns garbage plaintext.
 *  - Key wrapping: `DevKmsProvider` wraps the DEK with AES-256-GCM under a local
 *    base64 master key (`DEV_KMS_MASTER_KEY`), so dev/CI work with no cloud
 *    dependency. In prod a KMS-backed provider (AWS KMS Encrypt/Decrypt) drops in
 *    behind the same `KmsProvider` interface.
 *
 * The interfaces below are FROZEN (imported by api/worker/enrichment agents);
 * only the implementations live here.
 */
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'

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

/** AES-256 ⇒ 32-byte keys; GCM standard 96-bit IV (tag is the default 128-bit). */
const KEY_BYTES = 32
const IV_BYTES = 12

function assertKey(key: Uint8Array, label: string): void {
  if (key.length !== KEY_BYTES) {
    throw new Error(`${label} must be ${KEY_BYTES} bytes (got ${key.length})`)
  }
}

/** Concrete AES-256-GCM envelope crypto over Node's `crypto`. */
class NodeEnvelopeCrypto implements EnvelopeCrypto {
  generateDek(): Uint8Array {
    return new Uint8Array(randomBytes(KEY_BYTES))
  }

  encrypt(plaintext: string, dek: Uint8Array): Ciphertext {
    assertKey(dek, 'DEK')
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv('aes-256-gcm', dek, iv)
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return {
      ct: ct.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      v: CRYPTO_SCHEME_VERSION,
    }
  }

  decrypt(ciphertext: Ciphertext, dek: Uint8Array): string {
    assertKey(dek, 'DEK')
    const iv = Buffer.from(ciphertext.iv, 'base64')
    const tag = Buffer.from(ciphertext.tag, 'base64')
    const ct = Buffer.from(ciphertext.ct, 'base64')
    const decipher = createDecipheriv('aes-256-gcm', dek, iv)
    decipher.setAuthTag(tag)
    // GCM verifies the tag in final(): a wrong DEK or tampered bytes throw here
    // rather than yielding corrupted plaintext.
    const out = Buffer.concat([decipher.update(ct), decipher.final()])
    return out.toString('utf8')
  }

  async loadUserDek(wrappedDek: string, kms: KmsProvider): Promise<Uint8Array> {
    return kms.unwrapDek(wrappedDek)
  }
}

/**
 * Local dev/CI KMS: AES-256-GCM key-wrap under a base64 master key. Wrapped blob
 * is `v1.<iv>.<tag>.<wrappedKey>`, all base64. The scheme is versioned so a real
 * KMS provider can coexist and keys can be re-wrapped on rotation.
 */
export class DevKmsProvider implements KmsProvider {
  private readonly master: Uint8Array

  constructor(masterKey: Uint8Array) {
    assertKey(masterKey, 'DEV_KMS master key')
    this.master = masterKey
  }

  /**
   * Build from a base64 master key (defaults to `DEV_KMS_MASTER_KEY`). Throws if
   * unset — dev must provision a key; nothing silently runs unencrypted.
   */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): DevKmsProvider {
    const b64 = env.DEV_KMS_MASTER_KEY
    if (!b64) {
      throw new Error(
        'DEV_KMS_MASTER_KEY is not set. Generate one with: ' +
          "node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
      )
    }
    return new DevKmsProvider(new Uint8Array(Buffer.from(b64, 'base64')))
  }

  async wrapDek(dek: Uint8Array): Promise<string> {
    assertKey(dek, 'DEK')
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv('aes-256-gcm', this.master, iv)
    const wrapped = Buffer.concat([cipher.update(Buffer.from(dek)), cipher.final()])
    const tag = cipher.getAuthTag()
    return [
      `v${CRYPTO_SCHEME_VERSION}`,
      iv.toString('base64'),
      tag.toString('base64'),
      wrapped.toString('base64'),
    ].join('.')
  }

  async unwrapDek(wrapped: string): Promise<Uint8Array> {
    const parts = wrapped.split('.')
    if (parts.length !== 4 || parts[0] !== `v${CRYPTO_SCHEME_VERSION}`) {
      throw new Error('Malformed or unsupported wrapped DEK')
    }
    const iv = Buffer.from(parts[1]!, 'base64')
    const tag = Buffer.from(parts[2]!, 'base64')
    const ct = Buffer.from(parts[3]!, 'base64')
    const decipher = createDecipheriv('aes-256-gcm', this.master, iv)
    decipher.setAuthTag(tag)
    const dek = Buffer.concat([decipher.update(ct), decipher.final()])
    return new Uint8Array(dek)
  }
}

/** Shared, stateless instance — safe to reuse across requests. */
export const envelopeCrypto: EnvelopeCrypto = new NodeEnvelopeCrypto()

/** Factory for an {@link EnvelopeCrypto}. Returns the shared stateless instance. */
export function createEnvelopeCrypto(): EnvelopeCrypto {
  return envelopeCrypto
}

/**
 * Constant-time comparison of two byte arrays (for tests/assertions). Returns
 * false for length mismatches without leaking timing on the compare.
 */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

/**
 * Provable purge — the crypto-shredding lever.
 *
 * There is no key material to zero in this process: the user's DEK lives only as
 * the KMS-wrapped blob in `user_keys`. Deleting that row (this helper returns the
 * SQL to do so) means the DEK can never be unwrapped again, so every `*Ct`
 * column encrypted under it becomes permanently undecryptable — the data is
 * cryptographically shredded even though the ciphertext rows may still exist.
 *
 * Callers run the returned statement (parameterized) inside the same transaction
 * that tombstones the user, then write a `key.purge` row to `audit_log`.
 *
 * @returns a parameterized SQL statement and its params, deleting the wrapped DEK.
 */
export function purgeUserKey(userId: string): { sql: string; params: [string] } {
  return {
    sql: 'delete from user_keys where user_id = $1',
    params: [userId],
  }
}
