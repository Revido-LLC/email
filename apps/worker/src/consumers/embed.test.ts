import { describe, expect, it } from 'vitest'
import { FakeEmbeddingsClient } from '@revido/core'
import type { AccountContext, AccountCrypto } from '../db/accounts'
import type { UpsertEmbeddingInput } from '../mail/store'
import { makeEmbedConsumer, type EmbedDeps } from './embed'

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
    }

    await makeEmbedConsumer(deps)(PAYLOAD, JOB)
    expect(upserts).toHaveLength(0)
  })
})
