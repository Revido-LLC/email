/**
 * Route tests for agent authoring: `/agents/compile` (structured-output → a
 * validated `AgentPlan`, rejecting a non-conforming model result) and
 * `/agents/dry-run` (the compiled predicate matched over decrypted threads).
 *
 * The LLM client is injected as a `FakeLlmClient` whose JSON response is tuned
 * per test; `@revido/db/client` is mocked with the chainable fake transaction.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeLlmClient } from '@revido/core'
import { makeUserCrypto } from '../lib/crypto'
import { setLlmClient } from '../lib/ai'

const DEK = new Uint8Array(32).fill(7)
const crypto = makeUserCrypto(DEK)

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
    constructor(private readonly results: Map<unknown, unknown[]>) {}
    select(): this {
      return this
    }
    from(table: unknown): this {
      this.table = table
      return this
    }
    insert(table: unknown): this {
      this.table = table
      return this
    }
    values(): this {
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
    limit(): this {
      return this
    }
    innerJoin(): this {
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

const { agentsAiRouter } = await import('./agents-ai')
const { threads } = await import('@revido/db/schema')

const USER_ID = '11111111-1111-4111-8111-111111111111'

function threadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'th-1',
    accountId: 'acc-1',
    subjectCt: crypto.encrypt('Subject'),
    category: 'to-reply',
    priority: 'normal',
    priorityScore: 20,
    tldrCt: null,
    summaryCt: null,
    unread: true,
    starred: false,
    snoozedUntil: null,
    hasAttachments: false,
    awaitingReply: false,
    labels: [] as string[],
    language: null,
    lastMessageAt: new Date('2026-07-15T10:00:00Z'),
    ...overrides,
  }
}

beforeEach(() => {
  h.results.clear()
  h.session.value = { user: { id: USER_ID } }
  // Default: a non-conforming (triage-shaped) JSON response.
  setLlmClient(new FakeLlmClient())
})

afterEach(() => {
  setLlmClient(undefined)
})

async function post(path: string, body: unknown): Promise<Response> {
  return agentsAiRouter.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /agents/compile', () => {
  it('422s when the model result is not a valid agent plan', async () => {
    const res = await post('/compile', { description: 'archive newsletters' })
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: 'compile_failed' })
  })

  it('returns a validated AgentPlan on a conforming result', async () => {
    setLlmClient(
      new FakeLlmClient({
        respond: () =>
          JSON.stringify({
            trigger: 'new-mail',
            conditions: [{ field: 'from', op: 'contains', value: 'boss@' }],
            actions: [{ type: 'star', label: 'Star it' }],
          }),
      }),
    )
    const res = await post('/compile', { description: 'star anything from my boss' })
    expect(res.status).toBe(200)
    const plan = (await res.json()) as {
      trigger: string
      conditions: { field: string }[]
      actions: { type: string }[]
    }
    expect(plan.trigger).toBe('new-mail')
    expect(plan.conditions[0]?.field).toBe('from')
    expect(plan.actions[0]?.type).toBe('star')
  })

  it('400s on an empty description', async () => {
    const res = await post('/compile', { description: '' })
    expect(res.status).toBe(400)
  })
})

describe('POST /agents/dry-run', () => {
  it('returns only the threads the plan predicate matches', async () => {
    h.results.set(threads, [
      threadRow({ id: 'match-1', category: 'to-reply' }),
      threadRow({ id: 'skip-1', category: 'fyi' }),
    ])
    const res = await post('/dry-run', {
      plan: {
        trigger: 'new-mail',
        conditions: [{ field: 'category', op: 'is', value: 'to-reply' }],
        actions: [{ type: 'label', label: 'Tag it' }],
      },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { matches: { id: string }[] }
    expect(body.matches.map((t) => t.id)).toEqual(['match-1'])
  })

  it('400s on an invalid plan', async () => {
    const res = await post('/dry-run', { plan: { trigger: 'whenever', conditions: [], actions: [] } })
    expect(res.status).toBe(400)
  })
})
