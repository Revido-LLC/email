/**
 * Route tests for the AI surface: `/ai/draft` (SSE token stream), `/ai/chat`
 * (RAG stream + citations from retrieved chunks), and `/ai/quick-replies`
 * (non-streaming JSON).
 *
 * `@revido/db/client` is mocked with a chainable fake transaction (mirroring
 * `threads.test.ts`) extended with an `execute()` that returns preset retrieval
 * rows for the pgvector query. The LLM + embeddings clients are injected as
 * deterministic fakes via `setLlmClient` / `setEmbeddingsClient`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeEmbeddingsClient, FakeLlmClient } from '@revido/core'
import { makeUserCrypto } from '../lib/crypto'
import { setEmbeddingsClient, setLlmClient } from '../lib/ai'

const DEK = new Uint8Array(32).fill(7)
const crypto = makeUserCrypto(DEK)

const h = vi.hoisted(() => ({
  results: new Map<unknown, unknown[]>(),
  execRows: [] as unknown[],
  /** When set, successive `execute()` calls return these result-sets in order. */
  execQueue: null as null | unknown[][],
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
    returning(): this {
      return this
    }
    async execute(): Promise<unknown[]> {
      if (h.execQueue && h.execQueue.length > 0) return h.execQueue.shift() ?? []
      return h.execRows
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

const { aiRouter } = await import('./ai')

const USER_ID = '11111111-1111-4111-8111-111111111111'

/** Deterministic LLM: JSON requests → quick-reply shape; else a fixed draft string. */
function fakeLlm(): FakeLlmClient {
  return new FakeLlmClient({
    respond: (req) =>
      req.responseFormat?.type === 'json'
        ? JSON.stringify({ replies: ['Yes, that works', 'Can we reschedule?', 'No thanks'] })
        : 'Drafted reply body.',
  })
}

beforeEach(() => {
  h.results.clear()
  h.execRows = []
  h.execQueue = null
  h.session.value = { user: { id: USER_ID } }
  setLlmClient(fakeLlm())
  setEmbeddingsClient(new FakeEmbeddingsClient())
})

afterEach(() => {
  setLlmClient(undefined)
  setEmbeddingsClient(undefined)
})

async function post(path: string, body: unknown): Promise<Response> {
  return aiRouter.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /ai/draft', () => {
  it('streams SSE token events then a done event', async () => {
    const res = await post('/draft', { prompt: 'Reply politely declining.' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const text = await res.text()
    expect(text).toContain('event: token')
    expect(text).toContain('Drafted reply body.')
    expect(text).toContain('event: done')
  })

  it('401s without a session', async () => {
    h.session.value = null
    const res = await post('/draft', { prompt: 'hi' })
    expect(res.status).toBe(401)
  })

  it('400s on an empty prompt', async () => {
    const res = await post('/draft', { prompt: '' })
    expect(res.status).toBe(400)
  })
})

describe('POST /ai/chat', () => {
  it('streams tokens then a citations event assembled from retrieved chunks', async () => {
    h.execRows = [
      { threadId: 'th-1', date: '2026-01-10T00:00:00.000Z', distance: 0.10, textCt: crypto.encrypt('The invoice is due Friday.'), subjectCt: crypto.encrypt('Invoice #42') },
      { threadId: 'th-1', date: '2026-01-09T00:00:00.000Z', distance: 0.15, textCt: crypto.encrypt('Reminder about the invoice.'), subjectCt: crypto.encrypt('Invoice #42') },
      { threadId: 'th-2', date: '2026-01-08T00:00:00.000Z', distance: 0.40, textCt: crypto.encrypt('Lunch on Thursday?'), subjectCt: crypto.encrypt('Lunch') },
    ]
    const res = await post('/chat', { message: 'When is the invoice due?' })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('event: token')
    expect(text).toContain('event: citations')
    expect(text).toContain('event: done')

    const line = text.split('\n').find((l) => l.startsWith('data: [{'))
    expect(line).toBeDefined()
    const citations = JSON.parse(line!.slice('data: '.length)) as {
      threadId: string
      label: string
      date?: string
      snippet?: string
    }[]
    // Deduped to one citation per distinct thread, in re-ranked order, now
    // carrying the message date + a body snippet the UI can preview.
    expect(citations).toEqual([
      { threadId: 'th-1', label: 'Invoice #42', date: '2026-01-10T00:00:00.000Z', snippet: 'The invoice is due Friday.' },
      { threadId: 'th-2', label: 'Lunch', date: '2026-01-08T00:00:00.000Z', snippet: 'Lunch on Thursday?' },
    ])
  })

  it('still answers (empty citations) when nothing is retrieved', async () => {
    h.execRows = []
    const res = await post('/chat', { message: 'anything?' })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('event: citations')
    expect(text).toContain('data: []')
  })

  it('pseudonymizes PII to the model and restores real names in the stream', async () => {
    // The model must NEVER see real names/emails (the gateway would scrub them);
    // it sees opaque tokens, and we restore the real values as the answer streams.
    let seenByModel = ''
    setLlmClient(
      new FakeLlmClient({
        respond: (req) => {
          seenByModel = JSON.stringify({ system: req.system, messages: req.messages })
          // Echo the pseudonym the model would have seen for the sender.
          return 'The last email is from Contact_1 (john was cc-ed).'
        },
      }),
    )
    // 1st execute() = ANN chunks; 2nd = thread contacts.
    h.execQueue = [
      [
        {
          threadId: 'th-9',
          date: '2026-02-01T00:00:00.000Z',
          distance: 0.1,
          textCt: crypto.encrypt('John Ryan asked to add Sarah Chen (john@readi.com) to Slack.'),
          subjectCt: crypto.encrypt('Re: Signups'),
        },
      ],
      [{ name: 'John Ryan', email: 'john@readi.com' }],
    ]
    const res = await post('/chat', { message: 'whats the last email from John Ryan?' })
    expect(res.status).toBe(200)
    const text = await res.text()

    // The model turn carried tokens, never the real name/email.
    expect(seenByModel).toMatch(/Contact_\d+/)
    expect(seenByModel).not.toContain('John Ryan')
    expect(seenByModel).not.toContain('john@readi.com')

    // The streamed answer restored the real name from the token.
    const answer = text
      .split('\n')
      .filter((l) => l.startsWith('data: {"text"'))
      .map((l) => JSON.parse(l.slice('data: '.length)).text as string)
      .join('')
    expect(answer).toContain('John Ryan')
    expect(answer).not.toMatch(/Contact_\d+/)
  })
})

describe('POST /ai/quick-replies', () => {
  it('returns parsed reply suggestions', async () => {
    h.results.set((await import('@revido/db/schema')).threads, [
      {
        id: 'th-1',
        accountId: 'acc-1',
        subjectCt: crypto.encrypt('Coffee?'),
        category: 'to-reply',
        priority: 'normal',
        priorityScore: 10,
        tldrCt: null,
        summaryCt: null,
        unread: true,
        starred: false,
        snoozedUntil: null,
        hasAttachments: false,
        awaitingReply: false,
        labels: [],
        language: null,
        lastMessageAt: new Date('2026-07-15T10:00:00Z'),
      },
    ])
    const res = await post('/quick-replies', { threadId: 'th-1' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { replies: string[] }
    expect(body.replies).toEqual(['Yes, that works', 'Can we reschedule?', 'No thanks'])
  })

  it('404s when the thread is absent', async () => {
    const res = await post('/quick-replies', { threadId: 'missing' })
    expect(res.status).toBe(404)
  })
})
