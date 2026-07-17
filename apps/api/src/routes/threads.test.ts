/**
 * Route-level tests for a representative read (`GET /threads/:id`) and write
 * (`POST /threads/:id/archive`), plus the unauthenticated 401.
 *
 * `@revido/db/client` is mocked with a chainable fake transaction (no live DB):
 * `withUser`/`asService` run the handler callback against a `FakeQuery` whose
 * results are keyed by table object. Better Auth's session and `getUserCrypto` are
 * mocked so the encrypted rows decrypt with a known test DEK.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { makeUserCrypto } from '../lib/crypto'

const DEK = new Uint8Array(32).fill(7)

const h = vi.hoisted(() => ({
  results: new Map<unknown, unknown[]>(),
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
    private table: unknown
    private lastSet: Record<string, unknown> | undefined
    private returningMode = false
    constructor(private readonly results: Map<unknown, unknown[]>) {}
    select(): this {
      return this
    }
    from(table: unknown): this {
      this.table = table
      return this
    }
    update(table: unknown): this {
      this.table = table
      return this
    }
    insert(table: unknown): this {
      this.table = table
      return this
    }
    delete(table: unknown): this {
      this.table = table
      return this
    }
    set(payload: Record<string, unknown>): this {
      this.lastSet = payload
      return this
    }
    values(): this {
      return this
    }
    onConflictDoNothing(): this {
      return this
    }
    onConflictDoUpdate(): this {
      return this
    }
    where(): this {
      return this
    }
    orderBy(): this {
      return this
    }
    groupBy(): this {
      return this
    }
    limit(): this {
      return this
    }
    innerJoin(): this {
      return this
    }
    leftJoin(): this {
      return this
    }
    returning(): this {
      this.returningMode = true
      return this
    }
    private resolve(): unknown[] {
      let base = this.results.get(this.table) ?? []
      if (this.returningMode && this.lastSet) {
        const patch = this.lastSet
        base = base.map((r) => ({ ...(r as Record<string, unknown>), ...patch }))
      }
      this.returningMode = false
      this.lastSet = undefined
      return base
    }
    then(
      onFulfilled: (value: unknown[]) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ): unknown {
      return Promise.resolve(this.resolve()).then(onFulfilled, onRejected)
    }
  }
  return {
    withUser: (_userId: string, fn: (tx: unknown) => unknown) => fn(new FakeQuery(h.results)),
    asService: (fn: (tx: unknown) => unknown) => fn(new FakeQuery(h.results)),
  }
})

// Imported AFTER the mocks are registered.
const { threadsRouter } = await import('./threads')
const { threads } = await import('@revido/db/schema')

const crypto = makeUserCrypto(DEK)

function threadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'th-1',
    userId: 'u-1',
    accountId: 'acc-1',
    providerThreadId: null,
    subjectCt: crypto.encrypt('Quarterly report'),
    category: 'to-reply',
    priority: 'high',
    priorityScore: 82,
    tldrCt: crypto.encrypt('Please review the Q3 numbers'),
    summaryCt: null,
    unread: true,
    starred: false,
    snoozedUntil: null,
    hasAttachments: false,
    awaitingReply: false,
    labels: [] as string[],
    language: null,
    lastMessageAt: new Date('2026-07-15T10:00:00Z'),
    createdAt: new Date('2026-07-15T10:00:00Z'),
    updatedAt: new Date('2026-07-15T10:00:00Z'),
    ...overrides,
  }
}

beforeEach(() => {
  h.results.clear()
  h.session.value = { user: { id: '11111111-1111-4111-8111-111111111111' } }
})

describe('GET /threads/:id', () => {
  it('returns a decrypted thread', async () => {
    h.results.set(threads, [threadRow()])
    const res = await threadsRouter.request('/th-1')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; subject: string; tldr: string; priorityScore: number }
    expect(body.id).toBe('th-1')
    expect(body.subject).toBe('Quarterly report')
    expect(body.tldr).toBe('Please review the Q3 numbers')
    expect(body.priorityScore).toBe(82)
  })

  it('404s when the thread is absent', async () => {
    h.results.set(threads, [])
    const res = await threadsRouter.request('/missing')
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: 'not_found' })
  })

  it('401s without a session', async () => {
    h.session.value = null
    const res = await threadsRouter.request('/th-1')
    expect(res.status).toBe(401)
  })
})

describe('POST /threads/:id/archive', () => {
  it('adds the archived label and returns the updated thread', async () => {
    h.results.set(threads, [threadRow({ labels: [] })])
    const res = await threadsRouter.request('/th-1/archive', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; labels: string[] }
    expect(body.labels).toContain('archived')
  })

  it('404s when archiving an absent thread', async () => {
    h.results.set(threads, [])
    const res = await threadsRouter.request('/nope/archive', { method: 'POST' })
    expect(res.status).toBe(404)
  })
})
