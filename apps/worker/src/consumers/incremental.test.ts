import { describe, expect, it, vi } from 'vitest'
import type {
  IncrementalDelta,
  ProviderAdapter,
  ProviderCredentials,
  RawFetchedMessage,
} from '@revido/core'
import type { AccountContext, AccountCrypto } from '../db/accounts'
import type {
  PersistTarget,
  PersistedMessage,
  ResolvedAccountRef,
  SaveCursorInput,
  SyncStateRow,
} from '../mail/store'
import type { ClaimedJob } from '../queue/store'
import { QUEUE } from '../queue/jobs'
import { makeIncrementalConsumer, type IncrementalDeps } from './incremental'

const passthroughCrypto: AccountCrypto = {
  encrypt: (plaintext) => ({ ct: plaintext, iv: '', tag: '', v: 1 }),
  decrypt: (ciphertext) => ciphertext.ct,
}

const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111'
const USER_ID = '22222222-2222-2222-2222-222222222222'
const PAYLOAD = { accountId: ACCOUNT_ID }
const JOB: ClaimedJob = {
  id: 'j',
  queue: 'incremental',
  payload: PAYLOAD,
  attempts: 0,
  maxAttempts: 5,
}

function fakeAccount(provider: 'gmail' | 'outlook' = 'gmail'): AccountContext {
  return {
    accountId: ACCOUNT_ID,
    userId: USER_ID,
    provider,
    email: 'me@example.com',
    dek: new Uint8Array(32),
    creds: { accessToken: 'a', refreshToken: 'r', expiresAt: new Date().toISOString() },
    crypto: passthroughCrypto,
  }
}

function fakeMessage(overrides: Partial<RawFetchedMessage>): RawFetchedMessage {
  return {
    providerMessageId: 'm1',
    providerThreadId: 't1',
    from: { name: 'Sam', email: 'sam@acme.com' },
    to: [{ name: 'Me', email: 'me@example.com' }],
    subject: 'Hi',
    date: '2026-07-15T00:00:00Z',
    html: '<p>hi</p>',
    text: 'hi',
    outbound: false,
    headers: {},
    attachments: [],
    ...overrides,
  }
}

function fakeAdapter(
  delta: IncrementalDelta,
  opts: { connectReturns?: (creds: ProviderCredentials) => ProviderCredentials } = {},
): ProviderAdapter {
  const unsupported = (name: string) => (): never => {
    throw new Error(`unexpected adapter call: ${name}`)
  }
  return {
    provider: 'gmail',
    connect: (creds) => Promise.resolve((opts.connectReturns ?? ((c) => c))(creds)),
    incremental: () => Promise.resolve(delta),
    backfill: unsupported('backfill'),
    getMessage: unsupported('getMessage'),
    send: unsupported('send'),
    watch: unsupported('watch'),
    renewWatch: unsupported('renewWatch'),
    unsubscribe: unsupported('unsubscribe'),
  }
}

interface Harness {
  deps: IncrementalDeps
  persisted: RawFetchedMessage[]
  enqueued: { queue: string; payload: unknown }[]
  cursors: SaveCursorInput[]
  deleted: string[][]
  resolvedByEmail: { provider: string; email: string }[]
  resolvedBySubscription: string[]
}

function harness(
  delta: IncrementalDelta,
  opts: {
    provider?: 'gmail' | 'outlook'
    state?: SyncStateRow | null
    newIds?: Set<string>
    incremental?: ReturnType<typeof vi.fn>
    connectReturns?: (creds: ProviderCredentials) => ProviderCredentials
    /** Account returned by the provider-push resolvers (null = unresolvable). */
    resolved?: ResolvedAccountRef | null
  } = {},
): Harness {
  const persisted: RawFetchedMessage[] = []
  const enqueued: { queue: string; payload: unknown }[] = []
  const cursors: SaveCursorInput[] = []
  const deleted: string[][] = []
  const resolvedByEmail: { provider: string; email: string }[] = []
  const resolvedBySubscription: string[] = []
  const newIds = opts.newIds ?? new Set(delta.upserted.map((m) => m.providerMessageId))
  const adapter = fakeAdapter(delta, { connectReturns: opts.connectReturns })
  if (opts.incremental) adapter.incremental = opts.incremental
  const resolved =
    opts.resolved === undefined ? { accountId: ACCOUNT_ID, userId: USER_ID } : opts.resolved

  const deps: IncrementalDeps = {
    loadAccount: () => Promise.resolve(fakeAccount(opts.provider ?? 'gmail')),
    adapterFor: () => adapter,
    mail: {
      persistMessage: async (_target: PersistTarget, msg): Promise<PersistedMessage> => {
        persisted.push(msg)
        return {
          messageId: `db-${msg.providerMessageId}`,
          threadId: `db-${msg.providerThreadId}`,
          isNew: newIds.has(msg.providerMessageId),
        }
      },
      deleteMessages: async (_userId, ids) => {
        deleted.push(ids)
      },
      getSyncState: () => Promise.resolve(opts.state ?? { historyId: '100', deltaLink: null, backfillCursor: null, backfillComplete: true }),
      saveCursor: async (input) => {
        cursors.push(input)
      },
      resolveAccountByEmail: async (provider, email) => {
        resolvedByEmail.push({ provider, email })
        return resolved
      },
      resolveAccountBySubscription: async (subscriptionId) => {
        resolvedBySubscription.push(subscriptionId)
        return resolved
      },
    },
    jobs: {
      enqueue: async (queue, payload) => {
        enqueued.push({ queue, payload })
      },
    },
    saveCredentials: () => Promise.resolve(),
  }
  return { deps, persisted, enqueued, cursors, deleted, resolvedByEmail, resolvedBySubscription }
}

describe('makeIncrementalConsumer', () => {
  it('no-ops when no cursor exists yet (no watch has seeded one)', async () => {
    const incremental = vi.fn()
    const h = harness(
      { upserted: [], deletedProviderMessageIds: [], nextCursor: 'x' },
      { state: { historyId: null, deltaLink: null, backfillCursor: null, backfillComplete: false }, incremental },
    )
    await makeIncrementalConsumer(h.deps)(PAYLOAD, JOB)
    expect(incremental).not.toHaveBeenCalled()
    expect(h.cursors).toHaveLength(0)
    expect(h.persisted).toHaveLength(0)
  })

  it('upserts new inbound messages and enqueues embed + triage + summary for each', async () => {
    const delta: IncrementalDelta = {
      upserted: [fakeMessage({ providerMessageId: 'in', providerThreadId: 'ta', outbound: false })],
      deletedProviderMessageIds: [],
      nextCursor: '200',
    }
    const h = harness(delta)
    await makeIncrementalConsumer(h.deps)(PAYLOAD, JOB)

    const embed = h.enqueued.filter((e) => e.queue === QUEUE.embed)
    const triage = h.enqueued.filter((e) => e.queue === QUEUE.triage)
    const summary = h.enqueued.filter((e) => e.queue === QUEUE.summary)
    expect(embed).toHaveLength(1)
    expect(embed[0]?.payload).toEqual({ accountId: ACCOUNT_ID, messageId: 'db-in' })
    expect(triage).toHaveLength(1)
    expect(triage[0]?.payload).toEqual({
      accountId: ACCOUNT_ID,
      threadId: 'db-ta',
      messageId: 'db-in',
    })
    expect(summary).toHaveLength(1)
    expect(summary[0]?.payload).toEqual({ accountId: ACCOUNT_ID, threadId: 'db-ta' })
  })

  it('enqueues only one summary per thread when a burst lands on it', async () => {
    const delta: IncrementalDelta = {
      upserted: [
        fakeMessage({ providerMessageId: 'in1', providerThreadId: 'ta', outbound: false }),
        fakeMessage({ providerMessageId: 'in2', providerThreadId: 'ta', outbound: false }),
      ],
      deletedProviderMessageIds: [],
      nextCursor: '200',
    }
    const h = harness(delta)
    await makeIncrementalConsumer(h.deps)(PAYLOAD, JOB)
    expect(h.enqueued.filter((e) => e.queue === QUEUE.summary)).toHaveLength(1)
    expect(h.enqueued.filter((e) => e.queue === QUEUE.triage)).toHaveLength(2)
  })

  it('embeds but does not triage a new outbound (sent) message', async () => {
    const delta: IncrementalDelta = {
      upserted: [fakeMessage({ providerMessageId: 'out', outbound: true })],
      deletedProviderMessageIds: [],
      nextCursor: '200',
    }
    const h = harness(delta)
    await makeIncrementalConsumer(h.deps)(PAYLOAD, JOB)
    expect(h.enqueued.filter((e) => e.queue === QUEUE.embed)).toHaveLength(1)
    expect(h.enqueued.filter((e) => e.queue === QUEUE.triage)).toHaveLength(0)
    expect(h.enqueued.filter((e) => e.queue === QUEUE.summary)).toHaveLength(0)
  })

  it('does not re-enqueue for an already-seen (idempotent) message', async () => {
    const delta: IncrementalDelta = {
      upserted: [fakeMessage({ providerMessageId: 'dup' })],
      deletedProviderMessageIds: [],
      nextCursor: '200',
    }
    const h = harness(delta, { newIds: new Set() }) // persistMessage reports isNew=false
    await makeIncrementalConsumer(h.deps)(PAYLOAD, JOB)
    expect(h.persisted).toHaveLength(1)
    expect(h.enqueued).toHaveLength(0)
  })

  it('deletes removed messages and advances the Gmail historyId cursor', async () => {
    const delta: IncrementalDelta = {
      upserted: [],
      deletedProviderMessageIds: ['gone-1', 'gone-2'],
      nextCursor: '300',
    }
    const h = harness(delta, { provider: 'gmail' })
    await makeIncrementalConsumer(h.deps)(PAYLOAD, JOB)
    expect(h.deleted).toEqual([['gone-1', 'gone-2']])
    expect(h.cursors[0]).toEqual({
      accountId: ACCOUNT_ID,
      userId: USER_ID,
      historyId: '300',
      deltaLink: undefined,
    })
  })

  it('advances the Outlook deltaLink cursor (not historyId)', async () => {
    const delta: IncrementalDelta = { upserted: [], deletedProviderMessageIds: [], nextCursor: 'deltaURL' }
    const h = harness(delta, {
      provider: 'outlook',
      state: { historyId: null, deltaLink: 'old', backfillCursor: null, backfillComplete: true },
    })
    await makeIncrementalConsumer(h.deps)(PAYLOAD, JOB)
    expect(h.cursors[0]).toEqual({
      accountId: ACCOUNT_ID,
      userId: USER_ID,
      historyId: undefined,
      deltaLink: 'deltaURL',
    })
  })

  it('uses the payload cursor override when provided', async () => {
    const incremental = vi.fn(() =>
      Promise.resolve({ upserted: [], deletedProviderMessageIds: [], nextCursor: '999' }),
    )
    const h = harness(
      { upserted: [], deletedProviderMessageIds: [], nextCursor: '999' },
      { incremental, state: null },
    )
    await makeIncrementalConsumer(h.deps)({ accountId: ACCOUNT_ID, cursor: 'override-5' }, JOB)
    expect(incremental).toHaveBeenCalledWith(expect.anything(), 'override-5')
  })

  it('persists refreshed credentials when the adapter rotates the token', async () => {
    const refreshed: ProviderCredentials = {
      accessToken: 'fresh',
      refreshToken: 'r',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    }
    const saveCredentials = vi.fn((_account: AccountContext, _creds: ProviderCredentials) =>
      Promise.resolve(),
    )
    const h = harness(
      { upserted: [], deletedProviderMessageIds: [], nextCursor: '200' },
      { connectReturns: () => refreshed },
    )
    h.deps.saveCredentials = saveCredentials
    await makeIncrementalConsumer(h.deps)(PAYLOAD, JOB)
    expect(saveCredentials).toHaveBeenCalledTimes(1)
    expect(saveCredentials.mock.calls[0]?.[1]).toBe(refreshed)
  })

  it('resolves the account from a Gmail push envelope (by mailbox address)', async () => {
    const delta: IncrementalDelta = {
      upserted: [fakeMessage({ providerMessageId: 'in', providerThreadId: 'ta' })],
      deletedProviderMessageIds: [],
      nextCursor: '200',
    }
    const h = harness(delta, { provider: 'gmail' })
    const push = { provider: 'gmail' as const, emailAddress: 'me@example.com', historyId: '55' }
    await makeIncrementalConsumer(h.deps)(push, { ...JOB, payload: push })
    expect(h.resolvedByEmail).toEqual([{ provider: 'gmail', email: 'me@example.com' }])
    expect(h.persisted).toHaveLength(1)
    expect(h.enqueued.filter((e) => e.queue === QUEUE.triage)).toHaveLength(1)
  })

  it('resolves the account from an Outlook push envelope (by subscription id)', async () => {
    const delta: IncrementalDelta = { upserted: [], deletedProviderMessageIds: [], nextCursor: 'd2' }
    const h = harness(delta, {
      provider: 'outlook',
      state: { historyId: null, deltaLink: 'old', backfillCursor: null, backfillComplete: true },
    })
    const push = {
      provider: 'outlook' as const,
      subscriptionId: 'sub-42',
      resource: 'Users/x/messages/y',
      changeType: 'created',
    }
    await makeIncrementalConsumer(h.deps)(push, { ...JOB, payload: push })
    expect(h.resolvedBySubscription).toEqual(['sub-42'])
    expect(h.cursors[0]).toMatchObject({ accountId: ACCOUNT_ID, deltaLink: 'd2' })
  })

  it('is a no-op success when a provider push resolves to no account (stale subscription)', async () => {
    const incremental = vi.fn()
    const h = harness(
      { upserted: [], deletedProviderMessageIds: [], nextCursor: 'x' },
      { provider: 'outlook', resolved: null, incremental },
    )
    const push = {
      provider: 'outlook' as const,
      subscriptionId: 'gone',
      resource: 'Users/x/messages/y',
      changeType: 'created',
    }
    // Must NOT throw (so a stale subscription never dead-letters forever).
    await expect(
      makeIncrementalConsumer(h.deps)(push, { ...JOB, payload: push }),
    ).resolves.toBeUndefined()
    expect(incremental).not.toHaveBeenCalled()
    expect(h.persisted).toHaveLength(0)
    expect(h.cursors).toHaveLength(0)
  })
})
