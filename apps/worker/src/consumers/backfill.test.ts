import { describe, expect, it } from 'vitest'
import type {
  BackfillPage,
  LlmBatchRequest,
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
  submittedBatches: LlmBatchRequest[][]
}

function harness(
  page: BackfillPage,
  opts: { newIds?: Set<string>; batchTriage?: boolean } = {},
): Harness {
  const persisted: RawFetchedMessage[] = []
  const enqueued: { queue: string; payload: unknown }[] = []
  const progress: SaveBackfillProgressInput[] = []
  const syncLabels: { progress: number; label?: string }[] = []
  const submittedBatches: LlmBatchRequest[][] = []
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
    llm: {
      submitBatch: async (requests) => {
        submittedBatches.push(requests)
        return { batchId: `batch-${submittedBatches.length}` }
      },
    },
    // Default OFF so the base tests exercise the real-time fallback fan-out.
    batchTriage: opts.batchTriage ?? false,
    now: () => new Date('2026-07-20T00:00:00Z'),
    saveCredentials: () => Promise.resolve(),
  }
  return { deps, persisted, enqueued, progress, syncLabels, submittedBatches }
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

    // Fallback (batchTriage off) never touches the Batches API.
    expect(h.submittedBatches).toHaveLength(0)
    expect(h.enqueued.some((e) => e.queue === QUEUE.triageBatch)).toBe(false)
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

  it('imports only the last 30 days, then registers the watch for new mail', async () => {
    const page: BackfillPage = {
      messages: [
        fakeMessage({
          providerMessageId: 'recent',
          providerThreadId: 'recent-thread',
          date: '2026-07-15T00:00:00Z',
        }),
        fakeMessage({
          providerMessageId: 'old',
          providerThreadId: 'old-thread',
          date: '2026-06-01T00:00:00Z',
        }),
      ],
      nextCursor: 'older-page',
    }
    const h = harness(page)

    await makeBackfillConsumer(h.deps)(PAYLOAD, {
      id: 'j',
      queue: 'backfill',
      payload: PAYLOAD,
      attempts: 0,
      maxAttempts: 5,
    })

    expect(h.persisted.map((message) => message.providerMessageId)).toEqual(['recent'])
    expect(h.progress[0]).toMatchObject({
      backfillCursor: null,
      backfillComplete: true,
    })
    expect(h.enqueued.some((entry) => entry.queue === QUEUE.backfill)).toBe(false)
    expect(h.enqueued.some((entry) => entry.queue === QUEUE.renewWatch)).toBe(true)
  })

  it('routes inbound triage through ONE batch keyed by messageId and records the batchId', async () => {
    const page: BackfillPage = {
      messages: [
        fakeMessage({ providerMessageId: 'in1', providerThreadId: 'ta', outbound: false }),
        fakeMessage({ providerMessageId: 'in2', providerThreadId: 'ta', outbound: false }),
        fakeMessage({ providerMessageId: 'out', providerThreadId: 'tb', outbound: true }),
      ],
      nextCursor: null,
    }
    const h = harness(page, { batchTriage: true })

    await makeBackfillConsumer(h.deps)(PAYLOAD, {
      id: 'j',
      queue: 'backfill',
      payload: PAYLOAD,
      attempts: 0,
      maxAttempts: 5,
    })

    // Exactly one batch, carrying only the two inbound messages, keyed by messageId.
    expect(h.submittedBatches).toHaveLength(1)
    expect(h.submittedBatches[0]?.map((r) => r.customId)).toEqual(['db-in1', 'db-in2'])
    // Each request is a real triage request (strict JSON, cheap tier).
    expect(h.submittedBatches[0]?.[0]?.request.model).toBe('triage')
    expect(h.submittedBatches[0]?.[0]?.request.responseFormat).toEqual({ type: 'json' })

    // No real-time triage/summary jobs in batch mode — those are deferred to the poller.
    expect(h.enqueued.some((e) => e.queue === QUEUE.triage)).toBe(false)
    expect(h.enqueued.some((e) => e.queue === QUEUE.summary)).toBe(false)

    // Embed still runs eagerly for every new message (inbound + outbound).
    expect(h.enqueued.filter((e) => e.queue === QUEUE.embed)).toHaveLength(3)

    // A triage_batch poll job carries the batchId + the id map for re-keying.
    const pollJobs = h.enqueued.filter((e) => e.queue === QUEUE.triageBatch)
    expect(pollJobs).toHaveLength(1)
    expect(pollJobs[0]?.payload).toEqual({
      accountId: ACCOUNT_ID,
      batchId: 'batch-1',
      items: [
        { messageId: 'db-in1', threadId: 'db-ta' },
        { messageId: 'db-in2', threadId: 'db-ta' },
      ],
    })
  })

  it('submits no batch when a page has no new inbound mail', async () => {
    const page: BackfillPage = {
      messages: [fakeMessage({ providerMessageId: 'out', providerThreadId: 'tb', outbound: true })],
      nextCursor: null,
    }
    const h = harness(page, { batchTriage: true })

    await makeBackfillConsumer(h.deps)(PAYLOAD, {
      id: 'j',
      queue: 'backfill',
      payload: PAYLOAD,
      attempts: 0,
      maxAttempts: 5,
    })

    expect(h.submittedBatches).toHaveLength(0)
    expect(h.enqueued.some((e) => e.queue === QUEUE.triageBatch)).toBe(false)
    // Outbound is still embedded.
    expect(h.enqueued.filter((e) => e.queue === QUEUE.embed)).toHaveLength(1)
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
