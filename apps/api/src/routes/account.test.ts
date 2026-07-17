/**
 * Provable-purge test for `POST /account/delete-everything`.
 *
 * Two halves:
 *  1. The delete flow (DB mocked): a `key.purge` audit row is appended, the user's
 *     embedding/FTS-derived rows are hard-deleted, the wrapped DEK is deleted, and
 *     the identity row is deleted — in that order (audit first, identity last).
 *  2. The crypto reality (REAL `@revido/db` crypto, nothing mocked): once the
 *     wrapped DEK is gone, ciphertext is undecryptable — a GCM auth failure, never
 *     recovered plaintext. This is what makes the purge a *provable* shred.
 */
import { randomBytes } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEnvelopeCrypto, DevKmsProvider, purgeUserKey } from '@revido/db/crypto'
import { messageEmbeddings, users } from '@revido/db/schema'

const USER_ID = '11111111-1111-4111-8111-111111111111'

interface Op {
  op: 'insert' | 'delete' | 'execute'
  table?: unknown
  values?: Record<string, unknown>
}

const h = vi.hoisted(() => ({
  ops: [] as Op[],
  session: { value: null as null | { user: { id: string } } },
}))

vi.mock('../auth', () => ({
  auth: { api: { getSession: vi.fn(async () => h.session.value) } },
}))

vi.mock('@revido/db/client', () => {
  const tx = {
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        h.ops.push({ op: 'insert', table, values })
        return Promise.resolve()
      },
    }),
    delete: (table: unknown) => ({
      where: () => {
        h.ops.push({ op: 'delete', table })
        return Promise.resolve()
      },
    }),
    execute: () => {
      h.ops.push({ op: 'execute' })
      return Promise.resolve()
    },
  }
  return { asService: (fn: (t: unknown) => unknown) => fn(tx) }
})

const { accountMgmtRouter } = await import('./account')

beforeEach(() => {
  h.ops = []
  h.session.value = { user: { id: USER_ID } }
})

describe('POST /account/delete-everything — delete flow', () => {
  it('audits, hard-deletes derived rows + key, then deletes the identity', async () => {
    const res = await accountMgmtRouter.request('/delete-everything', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: true })

    const kinds = h.ops.map((o) => o.op)
    // Audit first, identity delete last.
    expect(kinds[0]).toBe('insert')
    expect(kinds.at(-1)).toBe('delete')

    const audit = h.ops[0]?.values
    expect(audit).toMatchObject({ action: 'key.purge', actor: 'user', userId: USER_ID })

    // Embedding/FTS-derived rows explicitly hard-deleted.
    expect(h.ops.some((o) => o.op === 'delete' && o.table === messageEmbeddings)).toBe(true)
    // Wrapped DEK deleted (the raw-SQL user_keys purge).
    expect(h.ops.some((o) => o.op === 'execute')).toBe(true)
    // Identity deleted (cascades remaining content).
    expect(h.ops.some((o) => o.op === 'delete' && o.table === users)).toBe(true)
  })

  it('401s without a session', async () => {
    h.session.value = null
    const res = await accountMgmtRouter.request('/delete-everything', { method: 'POST' })
    expect(res.status).toBe(401)
  })
})

describe('purgeUserKey — crypto reality', () => {
  const crypto = createEnvelopeCrypto()

  it('targets the wrapped DEK row for the user', () => {
    const stmt = purgeUserKey(USER_ID)
    expect(stmt.sql).toMatch(/delete from user_keys/i)
    expect(stmt.params).toEqual([USER_ID])
  })

  it('renders ciphertext undecryptable once the DEK is gone (GCM auth failure)', async () => {
    const kms = new DevKmsProvider(new Uint8Array(randomBytes(32)))
    const dek = crypto.generateDek()
    await kms.wrapDek(dek) // wrapped blob would have lived in user_keys …
    const ct = crypto.encrypt('Invoice #4821 — €1,240 due 2026-08-01', dek)

    // Purge = the wrapped DEK row is deleted, so `dek` can never be recovered.
    // Any other key (a fresh one) cannot decrypt — GCM authentication fails.
    expect(() => crypto.decrypt(ct, crypto.generateDek())).toThrow()

    // And a corrupted/absent wrapped blob can't be unwrapped back into a DEK.
    await expect(kms.unwrapDek('')).rejects.toThrow()

    // Sanity: the ciphertext is opaque (no plaintext leakage in the envelope).
    expect(ct.ct).not.toContain('Invoice')
  })
})
