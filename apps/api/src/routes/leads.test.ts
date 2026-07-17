/**
 * Route tests for `/leads`: an anonymous capture returns `{ id }`, and a
 * malformed body is rejected. `@revido/db/client` is mocked with a chainable
 * fake transaction; the Better Auth session resolves to `null` (anonymous).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  results: new Map<unknown, unknown[]>(),
  session: { value: null as null | { user: { id: string } } },
}))

vi.mock('../auth', () => ({
  auth: { api: { getSession: vi.fn(async () => h.session.value) } },
}))

vi.mock('@revido/db/client', () => {
  class FakeQuery {
    private table: unknown
    constructor(private readonly results: Map<unknown, unknown[]>) {}
    insert(table: unknown): this {
      this.table = table
      return this
    }
    values(): this {
      return this
    }
    returning(): this {
      return this
    }
    then(onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown): unknown {
      return Promise.resolve(this.results.get(this.table) ?? []).then(onFulfilled, onRejected)
    }
  }
  return {
    withUser: (_userId: string, fn: (tx: unknown) => unknown) => fn(new FakeQuery(h.results)),
    asService: (fn: (tx: unknown) => unknown) => fn(new FakeQuery(h.results)),
  }
})

const { leadsRouter } = await import('./leads')
const { leads } = await import('@revido/db/schema')

beforeEach(() => {
  h.results.clear()
  h.session.value = null
})

async function post(body: unknown): Promise<Response> {
  return leadsRouter.request('/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /leads', () => {
  it('inserts a lead and returns its id', async () => {
    h.results.set(leads, [{ id: 'lead-1' }])
    const res = await post({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      company: 'Analytical Engines',
      automate: 'sort my newsletters',
    })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'lead-1' })
  })

  it('400s on a malformed email', async () => {
    const res = await post({ name: 'Ada', email: 'not-an-email' })
    expect(res.status).toBe(400)
  })
})
