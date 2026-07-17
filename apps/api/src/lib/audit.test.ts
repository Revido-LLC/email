/**
 * Tests for the append-only audit writer and the audited break-glass decrypt.
 *
 * `@revido/db/client` and `./crypto` are mocked so the insert shape + the
 * audit-before-decrypt ordering are asserted without a DB or KMS.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  inserted: [] as Record<string, unknown>[],
  order: [] as string[],
}))

vi.mock('@revido/db/client', () => {
  const fakeTx = {
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        h.order.push('audit')
        h.inserted.push(v)
        return Promise.resolve()
      },
    }),
  }
  return {
    asService: (fn: (tx: unknown) => unknown) => fn(fakeTx),
  }
})

vi.mock('@revido/db/schema', () => ({ auditLog: { _: 'auditLog' } }))

vi.mock('./crypto', () => ({
  getUserCrypto: vi.fn(async () => {
    h.order.push('decrypt')
    return { encrypt: vi.fn(), decrypt: vi.fn(), decryptOptional: vi.fn() }
  }),
}))

const { appendAuditLog, breakGlassDecrypt } = await import('./audit')
const { getUserCrypto } = await import('./crypto')

beforeEach(() => {
  h.inserted = []
  h.order = []
  vi.clearAllMocks()
})

describe('appendAuditLog', () => {
  it('appends a normalized audit row via asService', async () => {
    await appendAuditLog({
      userId: 'u1',
      actor: 'user',
      action: 'key.purge',
      resourceType: 'user',
      resourceId: 'u1',
      metadata: { reason: 'test' },
    })
    expect(h.inserted).toHaveLength(1)
    expect(h.inserted[0]).toMatchObject({
      userId: 'u1',
      actor: 'user',
      action: 'key.purge',
      resourceType: 'user',
      resourceId: 'u1',
      metadata: { reason: 'test' },
    })
  })

  it('defaults optional fields to null', async () => {
    await appendAuditLog({ userId: null, actor: 'svc', action: 'decrypt' })
    expect(h.inserted[0]).toMatchObject({
      userId: null,
      resourceType: null,
      resourceId: null,
      metadata: null,
    })
  })

  it('uses a provided transaction instead of opening its own', async () => {
    const values = vi.fn(() => Promise.resolve())
    const tx = { insert: vi.fn(() => ({ values })) } as unknown as Parameters<typeof appendAuditLog>[1]
    await appendAuditLog({ userId: 'u2', actor: 'user', action: 'send' }, tx)
    expect(values).toHaveBeenCalledOnce()
    // The mocked asService writer was NOT used.
    expect(h.inserted).toHaveLength(0)
  })
})

describe('breakGlassDecrypt', () => {
  it('writes the decrypt audit row BEFORE handing back crypto', async () => {
    const crypto = await breakGlassDecrypt('u9', {
      actor: 'support:alice',
      reason: 'GDPR export request #123',
    })
    expect(typeof crypto.decrypt).toBe('function')
    expect(getUserCrypto).toHaveBeenCalledWith('u9', expect.anything())
    // Audit must be recorded before the DEK is unwrapped.
    expect(h.order).toEqual(['audit', 'decrypt'])
    expect(h.inserted[0]).toMatchObject({
      userId: 'u9',
      actor: 'support:alice',
      action: 'decrypt',
      resourceType: 'user',
      resourceId: 'u9',
      metadata: { reason: 'GDPR export request #123', path: 'break-glass' },
    })
  })
})
