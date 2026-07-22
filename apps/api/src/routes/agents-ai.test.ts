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
  it('auto-matches metadata-only plans (no content clause)', async () => {
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
    const body = (await res.json()) as { matched: { id: string }[]; excludedCount: number }
    expect(body.matched.map((t) => t.id)).toEqual(['match-1'])
    expect(body.excludedCount).toBe(0)
  })

  it('excludes dunning candidates for free and reports honest counts', async () => {
    // A receipt-category rule with a content clause. The pre-filter drops the
    // dunning subject for free (no AI); the plausible receipt is a candidate that
    // needs the AI classifier. No messages are seeded, so the fail-closed classify
    // returns false — proving the free exclusion + the new response shape.
    h.results.set(threads, [
      threadRow({ id: 'receipt-1', category: 'receipts', subjectCt: crypto.encrypt('Your receipt from Acme') }),
      threadRow({
        id: 'dunning-1',
        category: 'receipts',
        subjectCt: crypto.encrypt('FINAL NOTICE: update your payment'),
      }),
      threadRow({ id: 'off-1', category: 'fyi' }),
    ])
    const res = await post('/dry-run', {
      plan: {
        trigger: 'new-mail',
        conditions: [
          { field: 'category', op: 'is', value: 'receipts' },
          { field: 'content', op: 'is', value: 'a receipt for a completed payment' },
        ],
        actions: [{ type: 'forward', label: 'Forward', params: { to: 'a@b.co' } }],
      },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      matched: { id: string }[]
      candidateCount: number
      excludedCount: number
      excludedReasons: { label: string; count: number }[]
      sampledCount: number
      estimatedMatches: number
    }
    expect(body.excludedCount).toBe(1) // the dunning notice, dropped for free
    expect(body.excludedReasons[0]?.count).toBe(1)
    expect(body.candidateCount).toBe(2) // receipt + dunning (off-category filtered out)
    expect(body.sampledCount).toBe(1) // the one receipt survivor was sampled
    expect(typeof body.estimatedMatches).toBe('number')
  })

  it('400s on an invalid plan', async () => {
    const res = await post('/dry-run', { plan: { trigger: 'whenever', conditions: [], actions: [] } })
    expect(res.status).toBe(400)
  })
})

describe('POST /agents/clarify', () => {
  it('returns ≤3 pre-answered questions', async () => {
    setLlmClient(
      new FakeLlmClient({
        respond: () =>
          JSON.stringify({
            questions: [
              {
                id: 'attachments',
                question: 'Only messages with an attachment?',
                options: [
                  { id: 'yes', label: 'Only with an attachment' },
                  { id: 'any', label: 'Any message' },
                ],
                multi: false,
                defaultOptionIds: ['yes'],
              },
            ],
          }),
      }),
    )
    const res = await post('/clarify', { description: 'forward every receipt to accounting' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      questions: { defaultOptionIds: string[] }[]
    }
    expect(body.questions.length).toBeLessThanOrEqual(3)
    expect(body.questions[0]?.defaultOptionIds).toEqual(['yes'])
  })

  it('degrades gracefully to no questions on a bad model result', async () => {
    // The default FakeLlmClient emits a triage-shaped payload (not clarify-shaped).
    const res = await post('/clarify', { description: 'archive newsletters' })
    expect(res.status).toBe(200)
    expect((await res.json()) as { questions: unknown[] }).toEqual({ questions: [] })
  })
})

describe('POST /agents/compile with answers', () => {
  it('folds clarify answers into the model prompt', async () => {
    let seenUserContent = ''
    setLlmClient(
      new FakeLlmClient({
        respond: (req) => {
          seenUserContent = req.messages.map((m) => m.content).join('\n')
          return JSON.stringify({
            trigger: 'new-mail',
            conditions: [{ field: 'hasAttachments', op: 'is', value: 'true' }],
            actions: [{ type: 'forward', label: 'Forward', params: { to: 'a@b.co' } }],
          })
        },
      }),
    )
    const res = await post('/compile', {
      description: 'forward every receipt',
      answers: [{ question: 'Only with an attachment?', answer: 'Only with an attachment' }],
    })
    expect(res.status).toBe(200)
    expect(seenUserContent).toContain('Only with an attachment')
  })
})

describe('normalizePlan (strict-schema → agentPlanSchema)', () => {
  it('drops null schedule and collapses fixed nullable params to a sparse record', async () => {
    const { normalizePlan } = await import('./agents-ai')
    const strict = {
      trigger: 'new-mail',
      schedule: null,
      conditions: [{ field: 'category', op: 'is', value: 'receipts' }],
      actions: [
        { type: 'forward', label: 'Forward', params: { to: 'a@b.co', label: null, value: null } },
        { type: 'label', label: 'Tag', params: { to: null, label: 'Receipts', value: null } },
      ],
    }
    const out = normalizePlan(strict) as {
      schedule?: unknown
      actions: { type: string; params?: Record<string, string> }[]
    }
    expect('schedule' in out).toBe(false)
    expect(out.actions[0]?.params).toEqual({ to: 'a@b.co' })
    expect(out.actions[1]?.params).toEqual({ label: 'Receipts' })
    // The normalized result must satisfy the real Zod schema.
    const { agentPlanSchema } = await import('@revido/core/agent-plan')
    expect(agentPlanSchema.safeParse(out).success).toBe(true)
  })

  it('extracts a clean email when the model appends junk to the destination', async () => {
    setLlmClient(
      new FakeLlmClient({
        respond: () =>
          JSON.stringify({
            trigger: 'new-mail',
            schedule: null,
            conditions: [{ field: 'content', op: 'is', value: 'a receipt' }],
            // Token-limit force-close leaked into the string value.
            actions: [
              { type: 'forward', label: 'Forward', params: { to: 'accounting@revido.io}}]}]}] }', label: null, value: null } },
            ],
          }),
      }),
    )
    const res = await post('/compile', { description: 'Forward receipts to accounting@revido.io' })
    expect(res.status).toBe(200)
    const plan = (await res.json()) as { actions: { params?: { to?: string } }[] }
    expect(plan.actions[0]?.params?.to).toBe('accounting@revido.io')
  })

  it('keeps an explicit empty forward destination so the UI can prompt for it', async () => {
    const { normalizePlan } = await import('./agents-ai')
    const out = normalizePlan({
      trigger: 'new-mail',
      schedule: null,
      conditions: [],
      actions: [{ type: 'forward', label: 'Forward', params: { to: '', label: null, value: null } }],
    }) as { actions: { params?: Record<string, string> }[] }
    expect(out.actions[0]?.params).toEqual({ to: '' })
  })
})

describe('compile pseudonymizes emails past the PII-scrub', () => {
  it('sends an opaque token (not the real email) and decodes it back in the plan', async () => {
    let seen = ''
    setLlmClient(
      new FakeLlmClient({
        respond: (req) => {
          seen = req.messages.map((m) => m.content).join('\n')
          // The model only ever sees the token; it echoes it into the forward destination.
          const token = seen.match(/Mailbox_\d+/)?.[0] ?? 'Mailbox_1'
          return JSON.stringify({
            trigger: 'new-mail',
            schedule: null,
            conditions: [{ field: 'content', op: 'is', value: 'a receipt' }],
            actions: [{ type: 'forward', label: 'Forward', params: { to: token, label: null, value: null } }],
          })
        },
      }),
    )
    const res = await post('/compile', { description: 'Forward every receipt to accounting@revido.io' })
    expect(res.status).toBe(200)
    // The real email must NOT have been sent to the model...
    expect(seen).not.toContain('accounting@revido.io')
    expect(seen).toMatch(/Mailbox_\d+/)
    // ...but the compiled plan carries the real, decoded address.
    const plan = (await res.json()) as { actions: { params?: { to?: string } }[] }
    expect(plan.actions[0]?.params?.to).toBe('accounting@revido.io')
  })
})

describe('compile recovers a scrubbed forward destination', () => {
  it('replaces a redacted [EMAIL] with the address from the description', async () => {
    setLlmClient(
      new FakeLlmClient({
        respond: () =>
          JSON.stringify({
            trigger: 'new-mail',
            schedule: null,
            conditions: [{ field: 'content', op: 'is', value: 'a receipt' }],
            actions: [{ type: 'forward', label: 'Forward', params: { to: '[EMAIL]', label: null, value: null } }],
          }),
      }),
    )
    const res = await post('/compile', { description: 'Forward every receipt to accounting@revido.io' })
    expect(res.status).toBe(200)
    const plan = (await res.json()) as { actions: { type: string; params?: { to?: string } }[] }
    expect(plan.actions[0]?.params?.to).toBe('accounting@revido.io')
  })
})

describe('COMPILE_SYSTEM prompt', () => {
  it('documents the content field and the forward destination param', async () => {
    const { COMPILE_SYSTEM } = await import('./agents-ai')
    expect(COMPILE_SYSTEM).toContain('"content"')
    expect(COMPILE_SYSTEM).toContain('params')
    expect(COMPILE_SYSTEM).toMatch(/forward[\s\S]*"to"/i)
  })
})
