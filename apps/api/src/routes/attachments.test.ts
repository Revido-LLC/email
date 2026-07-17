/**
 * Route tests for `POST /attachments` — the composer upload → encrypted PENDING
 * persist.
 *
 * `@revido/db/client` is mocked with a chainable fake transaction (no live DB):
 * `withUser` runs the insert and its `.returning()` resolves to a scripted row
 * (the new attachment id). Better Auth's session and `getUserCrypto` are mocked so
 * the handler encrypts `content_ct` with a known test DEK.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  /** Rows the insert `.returning()` resolves to. */
  insertedRows: [] as unknown[],
  /** Every `.values(...)` payload passed to an insert, in order. */
  insertedValues: [] as Record<string, unknown>[],
  session: { value: null as null | { user: { id: string } } },
}))

vi.mock('../auth', () => ({
  auth: { api: { getSession: vi.fn(async () => h.session.value) } },
}))

vi.mock('../lib/crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/crypto')>()
  return {
    ...actual,
    getUserCrypto: vi.fn(async () => actual.makeUserCrypto(new Uint8Array(32).fill(7))),
  }
})

vi.mock('@revido/db/client', () => {
  class FakeQuery {
    insert(): this {
      return this
    }
    values(payload: Record<string, unknown>): this {
      h.insertedValues.push(payload)
      return this
    }
    returning(): this {
      return this
    }
    then(onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown): unknown {
      return Promise.resolve(h.insertedRows).then(onFulfilled, onRejected)
    }
  }
  return {
    withUser: (_userId: string, fn: (tx: unknown) => unknown) => fn(new FakeQuery()),
    asService: (fn: (tx: unknown) => unknown) => fn(new FakeQuery()),
  }
})

const { attachmentsRouter } = await import('./attachments')
const { makeUserCrypto } = await import('../lib/crypto')

const DEK = new Uint8Array(32).fill(7)

beforeEach(() => {
  h.insertedRows = []
  h.insertedValues = []
  h.session.value = { user: { id: '11111111-1111-4111-8111-111111111111' } }
})

async function upload(file: File): Promise<Response> {
  const form = new FormData()
  form.append('file', file)
  return attachmentsRouter.request('/', { method: 'POST', body: form })
}

describe('POST /attachments', () => {
  it('persists a PENDING, encrypted attachment and returns its DTO', async () => {
    h.insertedRows = [{ id: 'att-1' }]
    const res = await upload(
      new File([Buffer.from('hello attachment')], 'notes.txt', { type: 'text/plain' }),
    )

    expect(res.status).toBe(201)
    const body = (await res.json()) as { id: string; name: string; mime: string; kind: string; size: string }
    expect(body.id).toBe('att-1')
    expect(body.name).toBe('notes.txt')
    expect(body.mime).toBe('text/plain')
    expect(body.kind).toBe('other')

    // The row is pending (no message yet) and the bytes round-trip through the DEK.
    const values = h.insertedValues[0]!
    expect(values.messageId).toBeNull()
    expect(values.sizeBytes).toBe(Buffer.from('hello attachment').byteLength)
    const decrypted = makeUserCrypto(DEK).decrypt(values.contentCt as never)
    expect(Buffer.from(decrypted, 'base64').toString()).toBe('hello attachment')
  })

  it('rejects a file over the 10 MB cap with 413 and persists nothing', async () => {
    const oversized = new Uint8Array(10 * 1024 * 1024 + 1)
    const res = await upload(new File([oversized], 'big.bin', { type: 'application/octet-stream' }))

    expect(res.status).toBe(413)
    expect(await res.json()).toMatchObject({ error: 'attachment_too_large' })
    expect(h.insertedValues).toHaveLength(0)
  })

  it('400s when the multipart body carries no file', async () => {
    const form = new FormData()
    form.append('notafile', 'x')
    const res = await attachmentsRouter.request('/', { method: 'POST', body: form })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'no_file' })
  })

  it('401s without a session', async () => {
    h.session.value = null
    const res = await upload(new File([Buffer.from('x')], 'x.txt', { type: 'text/plain' }))
    expect(res.status).toBe(401)
  })
})
