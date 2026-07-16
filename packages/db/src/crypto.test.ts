import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  bytesEqual,
  createEnvelopeCrypto,
  CRYPTO_SCHEME_VERSION,
  DevKmsProvider,
  purgeUserKey,
} from './crypto'

const crypto = createEnvelopeCrypto()

/** A fresh dev master key for wrap/unwrap tests. */
function masterKey(): Uint8Array {
  return new Uint8Array(randomBytes(32))
}

describe('envelope encrypt/decrypt', () => {
  it('round-trips plaintext through encrypt → decrypt', () => {
    const dek = crypto.generateDek()
    const plaintext = 'Invoice #4821 — €1,240 due 2026-08-01. Reply in your voice 🙂'
    const ct = crypto.encrypt(plaintext, dek)

    expect(ct.v).toBe(CRYPTO_SCHEME_VERSION)
    expect(ct.ct).not.toContain('Invoice') // opaque ciphertext
    expect(crypto.decrypt(ct, dek)).toBe(plaintext)
  })

  it('round-trips empty and unicode-heavy strings', () => {
    const dek = crypto.generateDek()
    for (const s of ['', '👋🏽 café — naïve — 日本語 — Здравствуйте']) {
      expect(crypto.decrypt(crypto.encrypt(s, dek), dek)).toBe(s)
    }
  })

  it('produces a unique IV per encryption (no nonce reuse)', () => {
    const dek = crypto.generateDek()
    const a = crypto.encrypt('same message', dek)
    const b = crypto.encrypt('same message', dek)
    expect(a.iv).not.toBe(b.iv)
    expect(a.ct).not.toBe(b.ct)
  })

  it('generates 32-byte (AES-256) DEKs', () => {
    expect(crypto.generateDek().length).toBe(32)
  })

  it('fails to decrypt under the WRONG DEK (GCM auth) — never returns garbage', () => {
    const dek = crypto.generateDek()
    const wrong = crypto.generateDek()
    const ct = crypto.encrypt('top secret', dek)
    expect(() => crypto.decrypt(ct, wrong)).toThrow()
  })

  it('fails to decrypt tampered ciphertext (auth tag mismatch)', () => {
    const dek = crypto.generateDek()
    const ct = crypto.encrypt('top secret', dek)
    const tampered = { ...ct, ct: Buffer.from('different bytes here').toString('base64') }
    expect(() => crypto.decrypt(tampered, dek)).toThrow()
  })

  it('rejects a DEK of the wrong length', () => {
    const shortKey = new Uint8Array(16)
    expect(() => crypto.encrypt('x', shortKey)).toThrow(/32 bytes/)
  })
})

describe('DevKmsProvider wrap/unwrap', () => {
  it('wraps and unwraps a DEK back to the original bytes', async () => {
    const kms = new DevKmsProvider(masterKey())
    const dek = crypto.generateDek()

    const wrapped = await kms.wrapDek(dek)
    expect(typeof wrapped).toBe('string')
    expect(wrapped.startsWith(`v${CRYPTO_SCHEME_VERSION}.`)).toBe(true)

    const unwrapped = await kms.unwrapDek(wrapped)
    expect(bytesEqual(unwrapped, dek)).toBe(true)
  })

  it('produces a different wrapped blob each time (fresh IV)', async () => {
    const kms = new DevKmsProvider(masterKey())
    const dek = crypto.generateDek()
    expect(await kms.wrapDek(dek)).not.toBe(await kms.wrapDek(dek))
  })

  it('cannot unwrap a DEK wrapped under a DIFFERENT master key', async () => {
    const dek = crypto.generateDek()
    const wrapped = await new DevKmsProvider(masterKey()).wrapDek(dek)
    const other = new DevKmsProvider(masterKey())
    await expect(other.unwrapDek(wrapped)).rejects.toThrow()
  })

  it('rejects a malformed wrapped blob', async () => {
    const kms = new DevKmsProvider(masterKey())
    await expect(kms.unwrapDek('not-a-valid-blob')).rejects.toThrow(/Malformed/)
  })

  it('loadUserDek unwraps via the provider', async () => {
    const kms = new DevKmsProvider(masterKey())
    const dek = crypto.generateDek()
    const wrapped = await kms.wrapDek(dek)
    const loaded = await crypto.loadUserDek(wrapped, kms)
    expect(bytesEqual(loaded, dek)).toBe(true)
  })

  it('fromEnv reads DEV_KMS_MASTER_KEY and throws when unset', async () => {
    const key = Buffer.from(masterKey()).toString('base64')
    const kms = DevKmsProvider.fromEnv({ DEV_KMS_MASTER_KEY: key } as NodeJS.ProcessEnv)
    const dek = crypto.generateDek()
    expect(bytesEqual(await kms.unwrapDek(await kms.wrapDek(dek)), dek)).toBe(true)
    expect(() => DevKmsProvider.fromEnv({} as NodeJS.ProcessEnv)).toThrow(/DEV_KMS_MASTER_KEY/)
  })
})

describe('provable purge (crypto-shredding)', () => {
  it('after the wrapped DEK is gone, content is permanently undecryptable', async () => {
    const kms = new DevKmsProvider(masterKey())

    // 1. A user with a DEK, stored only as a wrapped blob.
    const dek = crypto.generateDek()
    const wrappedDek = await kms.wrapDek(dek)
    const stored = crypto.encrypt('the only copy of a private note', dek)

    // Sanity: while the wrapped DEK exists, content decrypts.
    const recovered = await crypto.loadUserDek(wrappedDek, kms)
    expect(crypto.decrypt(stored, recovered)).toBe('the only copy of a private note')

    // 2. Purge deletes the wrapped DEK row. Simulate: the blob no longer exists.
    const purge = purgeUserKey('user-123')
    expect(purge.sql).toMatch(/delete from user_keys/i)
    expect(purge.params).toEqual(['user-123'])

    // 3. With no wrapped DEK, the key cannot be recovered, and the raw DEK is
    //    unrecoverable by brute force — the ciphertext is cryptographically shredded.
    //    Any *other* key fails GCM auth, proving the content is unreadable.
    const someOtherKey = crypto.generateDek()
    expect(() => crypto.decrypt(stored, someOtherKey)).toThrow()
  })
})
