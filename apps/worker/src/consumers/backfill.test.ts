import { describe, expect, it } from 'vitest'
import type {
  BackfillPage,
  ProviderAdapter,
  ProviderCredentials,
  RawFetchedMessage,
} from '@revido/core'
import type { AccountContext, AccountCrypto } from '../db/accounts'
import type { PersistTarget, PersistedMessage, SaveBackfillProgressInput } from '../mail/store'
import { QUEUE } from '../queue/jobs'
import { makeBackfillConsumer, type BackfillDeps } from './backfill'

const passthroughCrypto: AccountCrypto = {
  encrypt: (plaintext) => ({ ct: plaintext, iv: '', tag: '', v: 1 }),
  decrypt: (ciphertext) => ciphertext.ct,
}

const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111'
const USER_ID = '22222222-2222-2222-2222-222222222222'

function fakeAccount(): AccountContext {
  return {
    accountId: ACCOUNT_ID,
    userId: USER_ID,
    provider: 'gmail',
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

/** A ProviderAdapter whose only live methods are connect + backfill. */
function fakeAdapter(page: BackfillPage): ProviderAdapter {
  const unsupported = (name: string) => (): never => {
    throw new Error(`unexpected adapter call: ${name}`)
  }
  return {
    provider: 'gmail',
    connect: (creds: ProviderCredentials) => Promise.resolve(creds),
    backfill: () => Promise.resolve(page),
    incremental: unsupported('incremental'),
    getMessage: unsupported('getMessage'),
    send: unsupported('send'),
    watch: unsupported('watch'),
    renewWatch: unsupported('renewWatch'),
    unsubscribe: unsupported('unsubscribe'),
  }
}

interface Harness {
  deps: BackfillDeps
  persisted: RawFetchedMessage[]
  enqueued: { queue: string; payload: unknown }[]
  progress: SaveBackfillProgressInput[]
  syncLabels: { progress: number; label?: string }[]
}

function harness(page: BackfillPage, opts: { newIds?: Set<string> } = {}): Harness {
  const persisted: RawFetchedMessage[] = []
  const enqueued: { queue: string; payload: unknown }[] = []
  const progress: SaveBackfillProgressInput[] = []
  const syncLabels: { progress: number; label?: string }[] = []
  const newIds = opts.newIds ?? new Set(page.messages.map((m) => m.providerMessageId))

  const deps: BackfillDeps = {
    loadAccount: () => Promise.resolve(fakeAccount()),
    adapterFor: () => fakeAdapter(page),
    mail: {
      persistMessage: async (_target: PersistTarget, msg): Promise<PersistedMessage> => {
        persisted.push(msg)
        return {
          messageId: `db-${msg.providerMessageId}`,
          threadId: `db-${msg.providerThreadId}`,
          isNew: newIds.has(msg.providerMessageId),
        }
      },
      getSyncState: () => Promise.resolve(null),
      saveBackfillProgress: async (input) => {
        progress.push(input)
      },
      setSyncProgress: async (_accountId, p, label) => {
        syncLabels.push({ progress: p, label })
      },
    },
    jobs: {
      enqueue: async (queue, payload) => {
        enqueued.push({ queue, payload })
      },
    },
    saveCredentials: () => Promise.resolve(),
  }
  return { deps, persisted, enqueued, progress, syncLabels }
}

const PAYLOAD = { accountId: ACCOUNT_ID }

describe('makeBackfillConsumer', () => {
  it('persists a page, triages new inbound only, and re-enqueues itself when more remain', async () => {
    const page: BackfillPage = {
      messages: [
        fakeMessage({ providerMessageId: 'in', providerThreadId: 'ta', outbound: false }),
        fakeMessage({ providerMessageId: 'out', providerThreadId: 'tb', outbound: true }),
      ],
      nextCursor: 'page-2',
    }
    const h = harness(page)

    await makeBackfillConsumer(h.deps)(PAYLOAD, {
      id: 'j',
      queue: 'backfill',
      payload: PAYLOAD,
      attempts: 0,
      maxAttempts: 5,
    })

    expect(h.persisted.map((m) => m.providerMessageId)).toEqual(['in', 'out'])

    const triageJobs = h.enqueued.filter((e) => e.queue === QUEUE.triage)
    expect(triageJobs).toHaveLength(1) // outbound message is not triaged
    expect(triageJobs[0]?.payload).toMatchObject({
      accountId: ACCOUNT_ID,
      messageId: 'db-in',
      threadId: 'db-ta',
    })

    // One summary per changed thread (the inbound thread only; outbound isn't summarized).
    const summaryJobs = h.enqueued.filter((e) => e.queue === QUEUE.summary)
    expect(summaryJobs).toHaveLength(1)
    expect(summaryJobs[0]?.payload).toEqual({ accountId: ACCOUNT_ID, threadId: 'db-ta' })

    expect(h.progress[0]).toEqual({
      accountId: ACCOUNT_ID,
      userId: USER_ID,
      backfillCursor: 'page-2',
      backfillComplete: false,
    })
    expect(h.enqueued.some((e) => e.queue === QUEUE.backfill)).toBe(true)
    expect(h.enqueued.some((e) => e.queue === QUEUE.renewWatch)).toBe(false)
  })

  it('marks complete and registers the watch when the last page arrives', async () => {
    const page: BackfillPage = {
      messages: [fakeMessage({ providerMessageId: 'in', providerThreadId: 'ta' })],
      nextCursor: null,
    }
    const h = harness(page)

    await makeBackfillConsumer(h.deps)(PAYLOAD, {
      id: 'j',
      queue: 'backfill',
      payload: PAYLOAD,
      attempts: 0,
      maxAttempts: 5,
    })

    expect(h.progress[0]?.backfillComplete).toBe(true)
    expect(h.progress[0]?.backfillCursor).toBeNull()
    expect(h.syncLabels[0]).toEqual({ progress: 1, label: 'Synced' })
    expect(h.enqueued.some((e) => e.queue === QUEUE.renewWatch)).toBe(true)
    expect(h.enqueued.some((e) => e.queue === QUEUE.backfill)).toBe(false)
  })

  it('does nothing once the account backfill is already complete', async () => {
    const page: BackfillPage = { messages: [fakeMessage({})], nextCursor: 'x' }
    const h = harness(page)
    h.deps.mail.getSyncState = () =>
      Promise.resolve({
        historyId: null,
        deltaLink: null,
        backfillCursor: null,
        backfillComplete: true,
      })

    await makeBackfillConsumer(h.deps)(PAYLOAD, {
      id: 'j',
      queue: 'backfill',
      payload: PAYLOAD,
      attempts: 0,
      maxAttempts: 5,
    })
    expect(h.persisted).toHaveLength(0)
    expect(h.enqueued).toHaveLength(0)
  })
})
