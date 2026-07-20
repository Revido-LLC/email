import { describe, expect, it, vi } from 'vitest'
import { FakeStorageProvider } from '@revido/core'
import type { RawFetchedMessage, TriageResult } from '@revido/core'
import type { AccountCrypto } from '../db/accounts'
import type { Tx, WorkerDb } from '../db/client'
import { PgMailStore } from './pg-store'

/** Passthrough crypto: ciphertext.ct holds the plaintext, so we can assert on it. */
const passthroughCrypto: AccountCrypto = {
  encrypt: (plaintext) => ({ ct: plaintext, iv: '', tag: '', v: 1 }),
  decrypt: (ciphertext) => ciphertext.ct,
}

const USER_ID = '22222222-2222-2222-2222-222222222222'
const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111'

interface SqlCall {
  text: string
  values: unknown[]
}

interface Route {
  when: (text: string) => boolean
  rows: unknown[]
}

/**
 * A scripted fake `WorkerDb`. Each tagged-template query is matched against the
 * first {@link Route} whose predicate holds (returning its canned rows), and every
 * call — text + bound values — is recorded. `sql.json(x)` wraps `x` in a marker so
 * a test can tell an encrypted (json) bind from a plaintext scalar bind.
 */
function scriptedDb(routes: Route[]): {
  db: WorkerDb
  calls: SqlCall[]
  withUserCount: () => number
} {
  const calls: SqlCall[] = []
  let withUserCalls = 0
  const tag = (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim().toLowerCase()
    calls.push({ text, values })
    const route = routes.find((r) => r.when(text))
    return Promise.resolve(route?.rows ?? [])
  }
  ;(tag as unknown as { json: (v: unknown) => unknown }).json = (v) => ({ __json: v })
  const sql = tag as unknown as Tx
  const db: WorkerDb = {
    sql: sql as unknown as WorkerDb['sql'],
    asService: (fn) => fn(sql),
    withUser: (_userId, fn) => {
      withUserCalls += 1
      return fn(sql)
    },
    close: () => Promise.resolve(),
  }
  return { db, calls, withUserCount: () => withUserCalls }
}

/** All json-wrapped (encrypted) bind values across every recorded call. */
function jsonBinds(calls: SqlCall[]): unknown[] {
  return calls.flatMap((c) =>
    c.values.flatMap((value) => {
      if (typeof value === 'object' && value != null && '__json' in value) {
        return [(value as { __json: unknown }).__json]
      }
      if (typeof value !== 'string') return []
      try {
        const parsed = JSON.parse(value) as Record<string, unknown>
        return parsed && typeof parsed === 'object' && 'ct' in parsed ? [parsed] : []
      } catch {
        return []
      }
    }),
  )
}

/** Every plaintext scalar bind value (i.e. not a json/encrypted wrapper). */
function scalarBinds(calls: SqlCall[]): unknown[] {
  return calls
    .flatMap((c) => c.values)
    .filter((v) => !(typeof v === 'object' && v != null && '__json' in v))
}

function fakeMessage(overrides: Partial<RawFetchedMessage> = {}): RawFetchedMessage {
  return {
    providerMessageId: 'pm-1',
    providerThreadId: 'pt-1',
    from: { name: 'Sam Rivera', email: 'sam@acme.com' },
    to: [{ name: 'Me', email: 'me@example.com' }],
    cc: [{ name: 'Finance', email: 'finance@acme.com' }],
    subject: 'Q3 numbers before Friday',
    date: '2026-07-15T00:00:00Z',
    html: '<p>Please review the Q3 numbers.</p>',
    text: 'Please review the Q3 numbers.',
    outbound: false,
    headers: {},
    attachments: [
      { providerAttachmentId: 'a1', name: 'q3.pdf', mime: 'application/pdf', size: 2048 },
    ],
    ...overrides,
  }
}

const target = { userId: USER_ID, accountId: ACCOUNT_ID, crypto: passthroughCrypto }

describe('PgMailStore.persistMessage — new message', () => {
  const routes: Route[] = [
    { when: (t) => t.includes('insert into contacts'), rows: [{ id: 'contact-1' }] },
    { when: (t) => t.includes('from threads'), rows: [] }, // no existing thread
    { when: (t) => t.includes('insert into threads'), rows: [{ id: 'thread-1' }] },
    { when: (t) => t.includes('from messages'), rows: [] }, // no existing message
    { when: (t) => t.includes('insert into messages'), rows: [{ id: 'message-1' }] },
  ]

  it('inserts thread + message and reports the message as new', async () => {
    const { db, calls } = scriptedDb(routes)
    const store = new PgMailStore(db)
    const msg = fakeMessage()
    const result = await store.persistMessage(target, msg)

    expect(result).toEqual({ messageId: 'message-1', threadId: 'thread-1', isNew: true })
    expect(calls.some((c) => c.text.includes('insert into threads'))).toBe(true)
    expect(calls.some((c) => c.text.includes('insert into messages'))).toBe(true)
    // Attachment + typed recipients are persisted.
    expect(calls.some((c) => c.text.includes('insert into attachments'))).toBe(true)
    expect(calls.some((c) => c.text.includes('insert into message_recipients'))).toBe(true)
  })

  it('encrypts content (subject/body) at rest and keeps provider metadata plaintext', async () => {
    const { db, calls } = scriptedDb(routes)
    const store = new PgMailStore(db)
    const msg = fakeMessage()
    await store.persistMessage(target, msg)

    const encrypted = jsonBinds(calls).map((c) => (c as { ct: string }).ct)
    // Subject and the plain-text body are written only as ciphertext envelopes.
    expect(encrypted).toContain(msg.subject)
    expect(encrypted).toContain(msg.text)
    expect(encrypted).toContain(msg.html) // raw html retained encrypted

    // The plaintext subject/body never appear as a bare (unencrypted) bind value.
    const scalars = scalarBinds(calls)
    expect(scalars).not.toContain(msg.subject)
    expect(scalars).not.toContain(msg.text)
    // Provider ids and dates, by contrast, are stored as queryable plaintext.
    expect(scalars).toContain(msg.providerMessageId)
    expect(scalars).toContain(msg.providerThreadId)
  })
})

describe('PgMailStore.persistMessage — idempotent re-ingest', () => {
  it('returns the existing ids without inserting a duplicate message', async () => {
    const { db, calls } = scriptedDb([
      { when: (t) => t.includes('insert into contacts'), rows: [{ id: 'contact-1' }] },
      { when: (t) => t.includes('from threads'), rows: [{ id: 'thread-existing' }] },
      { when: (t) => t.includes('from messages'), rows: [{ id: 'message-existing' }] },
    ])
    const store = new PgMailStore(db)
    const result = await store.persistMessage(target, fakeMessage())

    expect(result).toEqual({
      messageId: 'message-existing',
      threadId: 'thread-existing',
      isNew: false,
    })
    // Existing thread ⇒ update (not insert); existing message ⇒ no message insert.
    expect(calls.some((c) => c.text.includes('update threads'))).toBe(true)
    expect(calls.some((c) => c.text.includes('insert into messages'))).toBe(false)
  })
})

describe('PgMailStore.deleteMessages', () => {
  it('is a no-op (opens no transaction) for an empty id list', async () => {
    const { db, withUserCount } = scriptedDb([])
    await new PgMailStore(db).deleteMessages(USER_ID, [])
    expect(withUserCount()).toBe(0)
  })
})

describe('PgMailStore.saveCursor', () => {
  it('persists the subscription id alongside the cursor (service role)', async () => {
    const { db, calls } = scriptedDb([
      { when: (t) => t.includes('from accounts'), rows: [{ provider: 'outlook' }] },
    ])
    await new PgMailStore(db).saveCursor({
      accountId: ACCOUNT_ID,
      userId: USER_ID,
      deltaLink: 'delta-url',
      subscriptionId: 'sub-99',
    })
    const insert = calls.find((c) => c.text.includes('insert into sync_state'))
    expect(insert?.text).toContain('subscription_id')
    expect(insert?.values).toContain('sub-99')
    expect(insert?.values).toContain('delta-url')
  })
})

describe('PgMailStore.resolveAccountByEmail', () => {
  it('matches provider + address case-insensitively and returns the account ref', async () => {
    const { db, calls } = scriptedDb([
      {
        when: (t) => t.includes('from accounts'),
        rows: [{ account_id: ACCOUNT_ID, user_id: USER_ID }],
      },
    ])
    const ref = await new PgMailStore(db).resolveAccountByEmail('gmail', 'Me@Example.com')
    expect(ref).toEqual({ accountId: ACCOUNT_ID, userId: USER_ID })
    expect(calls[0]?.text).toContain('lower(email) = lower(')
    expect(calls[0]?.values).toEqual(expect.arrayContaining(['gmail', 'Me@Example.com']))
  })

  it('returns null when no account matches the mailbox', async () => {
    const { db } = scriptedDb([{ when: (t) => t.includes('from accounts'), rows: [] }])
    expect(await new PgMailStore(db).resolveAccountByEmail('gmail', 'nobody@x.com')).toBeNull()
  })
})

describe('PgMailStore.resolveAccountBySubscription', () => {
  it('resolves an account from the persisted Graph subscription id', async () => {
    const { db, calls } = scriptedDb([
      {
        when: (t) => t.includes('from sync_state'),
        rows: [{ account_id: ACCOUNT_ID, user_id: USER_ID }],
      },
    ])
    const ref = await new PgMailStore(db).resolveAccountBySubscription('sub-99')
    expect(ref).toEqual({ accountId: ACCOUNT_ID, userId: USER_ID })
    expect(calls[0]?.values).toContain('sub-99')
  })

  it('returns null for an unknown (stale) subscription id', async () => {
    const { db } = scriptedDb([{ when: (t) => t.includes('from sync_state'), rows: [] }])
    expect(await new PgMailStore(db).resolveAccountBySubscription('gone')).toBeNull()
  })
})

describe('PgMailStore.applyTriage', () => {
  it('encrypts the tldr and writes category/priority as queryable plaintext', async () => {
    const { db, calls } = scriptedDb([])
    const store = new PgMailStore(db)
    const result: TriageResult = {
      category: 'to-reply',
      priority: 'high',
      priorityScore: 74,
      tldr: 'Sam needs the Q3 numbers before Friday.',
      language: 'en',
    }
    await store.applyTriage({
      userId: USER_ID,
      threadId: 'thread-1',
      messageId: 'message-1',
      crypto: passthroughCrypto,
      result,
    })

    const encrypted = jsonBinds(calls).map((c) => (c as { ct: string }).ct)
    expect(encrypted).toContain(result.tldr)
    const scalars = scalarBinds(calls)
    expect(scalars).toContain('to-reply')
    expect(scalars).toContain('high')
    expect(scalars).toContain(74)
  })
})

describe('PgMailStore.applySummary', () => {
  it('encrypts the summary + each fact label/value/href, keeping type/position plaintext', async () => {
    const { db, calls } = scriptedDb([])
    const store = new PgMailStore(db)
    await store.applySummary({
      userId: USER_ID,
      threadId: 'thread-1',
      crypto: passthroughCrypto,
      summary: 'Order shipped; $249 due Friday.',
      facts: [
        { type: 'amount', label: 'Total', value: '$249.00' },
        { type: 'link', label: 'Unsubscribe', value: 'Unsubscribe', href: 'https://x.test/u' },
      ],
    })

    // Prior facts are cleared before re-insert so enrichment is idempotent per thread.
    expect(calls.some((c) => c.text.includes('delete from extracted_facts'))).toBe(true)

    const encrypted = jsonBinds(calls).map((c) => (c as { ct: string }).ct)
    expect(encrypted).toContain('Order shipped; $249 due Friday.') // summary ct
    expect(encrypted).toContain('Total') // fact label ct
    expect(encrypted).toContain('$249.00') // fact value ct
    expect(encrypted).toContain('https://x.test/u') // fact href ct

    // `type` (+ position) is queryable plaintext; the value/label never appear bare.
    const scalars = scalarBinds(calls)
    expect(scalars).toContain('amount')
    expect(scalars).toContain('link')
    expect(scalars).not.toContain('$249.00')
    expect(scalars).not.toContain('Total')
  })

  it('writes no fact rows when extraction found nothing', async () => {
    const { db, calls } = scriptedDb([])
    await new PgMailStore(db).applySummary({
      userId: USER_ID,
      threadId: 'thread-1',
      crypto: passthroughCrypto,
      summary: 'Nothing structured here.',
      facts: [],
    })
    expect(calls.some((c) => c.text.includes('insert into extracted_facts'))).toBe(false)
  })
})

describe('PgMailStore.listNewMailAgents', () => {
  it('selects only enabled, new-mail-triggered agents as the service role', async () => {
    const { db, calls, withUserCount } = scriptedDb([
      { when: (t) => t.includes('from agents'), rows: [{ id: 'agent-1' }, { id: 'agent-2' }] },
    ])
    const agents = await new PgMailStore(db).listNewMailAgents(USER_ID)
    expect(agents).toEqual([{ id: 'agent-1' }, { id: 'agent-2' }])

    const q = calls.find((c) => c.text.includes('from agents'))
    expect(q?.text).toContain('enabled = true')
    expect(q?.text).toContain("trigger = 'new-mail'")
    expect(q?.values).toContain(USER_ID)
    // Agent config is plaintext and read service-side — no withUser/RLS transaction.
    expect(withUserCount()).toBe(0)
  })
})

describe('PgMailStore.increment', () => {
  it('bumps a usage counter for the current YYYY-MM period by default', async () => {
    const { db, calls } = scriptedDb([])
    await new PgMailStore(db).increment(USER_ID, 'ai_enrichments')
    const period = calls[0]?.values.find((v) => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v))
    expect(period).toBeDefined()
    expect(calls[0]?.values).toContain('ai_enrichments')
  })

  it('honors an explicit period and delta', async () => {
    const { db, calls } = scriptedDb([])
    await new PgMailStore(db).increment(USER_ID, 'digests', 3, '2026-01')
    expect(calls[0]?.values).toContain('2026-01')
    expect(calls[0]?.values).toContain(3)
  })
})

describe('PgMailStore.upsertMessageEmbedding', () => {
  it('serializes the vector as a pgvector literal', async () => {
    const { db, calls } = scriptedDb([])
    await new PgMailStore(db).upsertMessageEmbedding({
      userId: USER_ID,
      messageId: 'message-1',
      embedding: [0.1, 0.2, 0.3],
      model: 'voyage-3',
    })
    expect(calls[0]?.values).toContain('[0.1,0.2,0.3]')
    expect(calls[0]?.values).toContain('voyage-3')
  })
})

describe('PgMailStore.getOutboundMessage — attachments', () => {
  const ct = (s: string) => ({ ct: s, iv: '', tag: '', v: 1 })
  const MESSAGE_ID = '44444444-4444-4444-4444-444444444444'
  const STORED_REF = 'attachments/u/ref-1'
  const inlineB64 = Buffer.from('inline-bytes').toString('base64')

  function routes(): Route[] {
    return [
      {
        when: (t) => t.includes('m.html_ct, m.text_ct from messages'),
        rows: [
          {
            thread_id: 'thread-1',
            subject_ct: ct('Re: Q3'),
            html_ct: ct('<p>hi</p>'),
            text_ct: ct('hi'),
          },
        ],
      },
      {
        when: (t) => t.includes('c.email, c.name, r.kind'),
        rows: [{ email: 'to@acme.com', name: 'To', kind: 'to' }],
      },
      {
        when: (t) => t.includes('outbound = false and provider_message_id is not null'),
        rows: [{ provider_message_id: 'parent-9' }],
      },
      {
        when: (t) => t.includes('content_ct, storage_ref_ct from attachments'),
        rows: [
          {
            name: 'inline.txt',
            mime: 'text/plain',
            content_ct: ct(inlineB64),
            storage_ref_ct: null,
          },
          {
            name: 'big.pdf',
            mime: 'application/pdf',
            content_ct: null,
            storage_ref_ct: ct(STORED_REF),
          },
        ],
      },
    ]
  }

  it('returns inline bytes as-is and fetches stored bytes from the StorageProvider', async () => {
    const { db } = scriptedDb(routes())
    const storage = new FakeStorageProvider()
    await storage.put(STORED_REF, new Uint8Array([9, 8, 7]))
    const store = new PgMailStore(db, storage)

    const outbound = await store.getOutboundMessage(USER_ID, MESSAGE_ID, passthroughCrypto)
    expect(outbound).not.toBeNull()
    const atts = outbound!.attachments!
    expect(atts).toHaveLength(2)

    const inline = atts.find((a) => a.name === 'inline.txt')!
    expect(Buffer.from(inline.content).toString()).toBe('inline-bytes')

    const stored = atts.find((a) => a.name === 'big.pdf')!
    expect(stored.mime).toBe('application/pdf')
    expect(stored.content).toEqual(new Uint8Array([9, 8, 7]))
  })

  it('omits the attachments array when the message has none', async () => {
    const noAttachments = routes().filter(
      (r) => !r.when('content_ct, storage_ref_ct from attachments'),
    )
    const { db } = scriptedDb(noAttachments)
    const store = new PgMailStore(db, new FakeStorageProvider())
    const outbound = await store.getOutboundMessage(USER_ID, MESSAGE_ID, passthroughCrypto)
    expect(outbound?.attachments).toBeUndefined()
  })
})

describe('PgMailStore.markSent', () => {
  it('is a defensive no-throw wrapper around the update', async () => {
    const { db, calls } = scriptedDb([])
    const store = new PgMailStore(db)
    await expect(store.markSent(USER_ID, 'message-1', 'provider-xyz')).resolves.toBeUndefined()
    expect(calls[0]?.text).toContain('update messages')
    expect(calls[0]?.values).toEqual(expect.arrayContaining(['provider-xyz', 'message-1']))
  })
})

describe('PgMailStore uses withUser (RLS) for content writes', () => {
  it('scopes persistMessage under the owning user', async () => {
    const withUser = vi.fn((_userId: string, fn: (tx: Tx) => Promise<unknown>) => {
      const tag = (): Promise<unknown[]> => Promise.resolve([{ id: 'x' }])
      ;(tag as unknown as { json: (v: unknown) => unknown }).json = (v) => v
      return fn(tag as unknown as Tx)
    })
    const db = {
      sql: {} as WorkerDb['sql'],
      asService: (fn: (tx: Tx) => Promise<unknown>) => fn({} as Tx),
      withUser,
      close: () => Promise.resolve(),
    } as unknown as WorkerDb
    await new PgMailStore(db).persistMessage(target, fakeMessage({ cc: [], attachments: [] }))
    expect(withUser).toHaveBeenCalledWith(USER_ID, expect.any(Function))
  })
})
