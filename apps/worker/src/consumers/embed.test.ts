import { describe, expect, it } from 'vitest'
import { EmbeddingsRateLimitError, FakeEmbeddingsClient, type EmbeddingsClient } from '@revido/core'
import type { AccountContext, AccountCrypto } from '../db/accounts'
import type { UpsertEmbeddingInput } from '../mail/store'
import { makeEmbedConsumer, type EmbedDeps } from './embed'

/** Records enqueued jobs so tests can assert on deferral behavior. */
function fakeJobs() {
  const enqueued: { queue: string; payload: unknown; runAt?: Date }[] = []
  return {
    enqueued,
    store: {
      enqueue: async (queue: string, payload: unknown, opts?: { runAt?: Date }) => {
        enqueued.push({ queue, payload, runAt: opts?.runAt })
      },
    },
  }
}

const NOW = new Date('2026-07-22T12:00:00.000Z')

/** An embeddings client that always rejects with a rate-limit error. */
const rateLimited: Pick<EmbeddingsClient, 'embed' | 'model'> = {
  model: 'voyage-3',
  embed: () => Promise.reject(new EmbeddingsRateLimitError(429, 'Voyage', 'slow down')),
}

const passthroughCrypto: AccountCrypto = {
  encrypt: (plaintext) => ({ ct: plaintext, iv: '', tag: '', v: 1 }),
  decrypt: (ciphertext) => ciphertext.ct,
}

const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111'
const USER_ID = '22222222-2222-2222-2222-222222222222'
const MESSAGE_ID = '44444444-4444-4444-4444-444444444444'

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

const PAYLOAD = { accountId: ACCOUNT_ID, messageId: MESSAGE_ID }
const JOB = { id: 'j', queue: 'embed', payload: PAYLOAD, attempts: 0, maxAttempts: 5 }

describe('makeEmbedConsumer', () => {
  it('embeds subject + body into a 1024-dim vector and upserts it', async () => {
    const upserts: UpsertEmbeddingInput[] = []
    const increments: string[] = []
    const embeddings = new FakeEmbeddingsClient() // 1024-dim by default

    const deps: EmbedDeps = {
      loadAccount: () => Promise.resolve(fakeAccount()),
      mail: {
        getMessageText: () => Promise.resolve({ subject: 'Invoice #42', text: 'Payment is due.' }),
        upsertMessageEmbedding: async (input) => {
          upserts.push(input)
        },
        increment: async (_userId, metric) => {
          increments.push(metric)
        },
      },
      embeddings,
      jobs: fakeJobs().store,
      now: () => NOW,
    }

    await makeEmbedConsumer(deps)(PAYLOAD, JOB)

    expect(upserts).toHaveLength(1)
    expect(upserts[0]?.messageId).toBe(MESSAGE_ID)
    expect(upserts[0]?.userId).toBe(USER_ID)
    expect(upserts[0]?.embedding).toHaveLength(1024)
    expect(upserts[0]?.model).toBe('fake')
    expect(increments).toEqual(['ai_embeddings'])
  })

  it('is a no-op when the message vanished before the job ran', async () => {
    const upserts: UpsertEmbeddingInput[] = []
    const deps: EmbedDeps = {
      loadAccount: () => Promise.resolve(fakeAccount()),
      mail: {
        getMessageText: () => Promise.resolve(null),
        upsertMessageEmbedding: async (input) => {
          upserts.push(input)
        },
        increment: async () => {},
      },
      embeddings: new FakeEmbeddingsClient(),
      jobs: fakeJobs().store,
      now: () => NOW,
    }

    await makeEmbedConsumer(deps)(PAYLOAD, JOB)
    expect(upserts).toHaveLength(0)
  })

  it('defers (re-enqueues with backoff) instead of failing when the provider rate-limits', async () => {
    const jobs = fakeJobs()
    const upserts: UpsertEmbeddingInput[] = []
    const deps: EmbedDeps = {
      loadAccount: () => Promise.resolve(fakeAccount()),
      mail: {
        getMessageText: () => Promise.resolve({ subject: 'Invoice #42', text: 'Payment is due.' }),
        upsertMessageEmbedding: async (input) => {
          upserts.push(input)
        },
        increment: async () => {},
      },
      embeddings: rateLimited,
      jobs: jobs.store,
      now: () => NOW,
    }

    // Must NOT throw (would dead-letter); instead re-enqueues itself for later.
    await expect(makeEmbedConsumer(deps)(PAYLOAD, JOB)).resolves.toBeUndefined()
    expect(upserts).toHaveLength(0)
    expect(jobs.enqueued).toHaveLength(1)
    expect(jobs.enqueued[0]?.queue).toBe('embed')
    expect(jobs.enqueued[0]?.payload).toMatchObject({ messageId: MESSAGE_ID, deferrals: 1 })
    // First deferral backs off 60s.
    expect(jobs.enqueued[0]?.runAt?.getTime()).toBe(NOW.getTime() + 60_000)
  })

  it('gives up (no re-enqueue) once the deferral cap is reached, without throwing', async () => {
    const jobs = fakeJobs()
    const deps: EmbedDeps = {
      loadAccount: () => Promise.resolve(fakeAccount()),
      mail: {
        getMessageText: () => Promise.resolve({ subject: 'Invoice #42', text: 'Payment is due.' }),
        upsertMessageEmbedding: async () => {},
        increment: async () => {},
      },
      embeddings: rateLimited,
      jobs: jobs.store,
      now: () => NOW,
    }

    const cappedPayload = { ...PAYLOAD, deferrals: 30 }
    await expect(
      makeEmbedConsumer(deps)(cappedPayload, { ...JOB, payload: cappedPayload }),
    ).resolves.toBeUndefined()
    expect(jobs.enqueued).toHaveLength(0)
  })

  it('still throws non-rate-limit provider errors so the runner can retry', async () => {
    const jobs = fakeJobs()
    const deps: EmbedDeps = {
      loadAccount: () => Promise.resolve(fakeAccount()),
      mail: {
        getMessageText: () => Promise.resolve({ subject: 'x', text: 'y' }),
        upsertMessageEmbedding: async () => {},
        increment: async () => {},
      },
      embeddings: {
        model: 'voyage-3',
        embed: () => Promise.reject(new Error('Voyage embeddings failed: 500 boom')),
      },
      jobs: jobs.store,
      now: () => NOW,
    }

    await expect(makeEmbedConsumer(deps)(PAYLOAD, JOB)).rejects.toThrow(/500/)
    expect(jobs.enqueued).toHaveLength(0)
  })
})
