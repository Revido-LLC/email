import { describe, expect, it, vi } from 'vitest'
import type { ProviderAdapter, ProviderCredentials } from '@revido/core'
import type { AccountContext, AccountCrypto } from '../db/accounts'
import type { ChaserSendData } from '../mail/store'
import { makeChaserConsumer, type ChaserDeps } from './chaser'

const passthroughCrypto: AccountCrypto = {
  encrypt: (plaintext) => ({ ct: plaintext, iv: '', tag: '', v: 1 }),
  decrypt: (ciphertext) => ciphertext.ct,
}

const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111'
const USER_ID = '22222222-2222-2222-2222-222222222222'
const REMINDER_ID = '55555555-5555-5555-5555-555555555555'

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

const CHASER: ChaserSendData = {
  accountId: ACCOUNT_ID,
  to: [{ name: 'Sam', email: 'sam@acme.com' }],
  subject: 'Re: Q3 numbers',
  html: '<p>Just following up.</p>',
  text: 'Just following up.',
  inReplyToProviderMessageId: 'orig-1',
}

const PAYLOAD = { userId: USER_ID, reminderId: REMINDER_ID }
const JOB = { id: 'j', queue: 'chaser', payload: PAYLOAD, attempts: 0, maxAttempts: 5 }

function fakeAdapter(onSend: (arg: unknown) => void): ProviderAdapter {
  const unsupported = (name: string) => (): never => {
    throw new Error(`unexpected adapter call: ${name}`)
  }
  return {
    provider: 'gmail',
    connect: (creds: ProviderCredentials) => Promise.resolve(creds),
    backfill: unsupported('backfill'),
    incremental: unsupported('incremental'),
    getMessage: unsupported('getMessage'),
    send: (_creds, msg) => {
      onSend(msg)
      return Promise.resolve({ providerMessageId: 'sent-1' })
    },
    watch: unsupported('watch'),
    renewWatch: unsupported('renewWatch'),
    unsubscribe: unsupported('unsubscribe'),
  }
}

describe('makeChaserConsumer', () => {
  it('sends the pre-drafted chaser, resolves the reminder, and meters it', async () => {
    const sends: unknown[] = []
    const deleted: string[] = []
    const increments: string[] = []

    const deps: ChaserDeps = {
      loadAccount: () => Promise.resolve(fakeAccount()),
      loadUserCrypto: () => Promise.resolve({ userId: USER_ID, crypto: passthroughCrypto }),
      adapterFor: () => fakeAdapter((m) => sends.push(m)),
      mail: {
        getChaserSendData: () => Promise.resolve(CHASER),
        deleteReminder: async (_userId, id) => {
          deleted.push(id)
        },
        increment: async (_userId, metric) => {
          increments.push(metric)
        },
      },
      saveCredentials: () => Promise.resolve(),
    }

    await makeChaserConsumer(deps)(PAYLOAD, JOB)

    expect(sends).toHaveLength(1)
    expect(sends[0]).toMatchObject({
      to: [{ email: 'sam@acme.com' }],
      subject: 'Re: Q3 numbers',
      inReplyToProviderMessageId: 'orig-1',
    })
    expect(deleted).toEqual([REMINDER_ID])
    expect(increments).toEqual(['chasers_sent'])
  })

  it('is a no-op when the reminder was withdrawn before the job ran', async () => {
    const adapterFor = vi.fn()
    const deps: ChaserDeps = {
      loadAccount: () => Promise.resolve(fakeAccount()),
      loadUserCrypto: () => Promise.resolve({ userId: USER_ID, crypto: passthroughCrypto }),
      adapterFor,
      mail: {
        getChaserSendData: () => Promise.resolve(null),
        deleteReminder: vi.fn(),
        increment: vi.fn(),
      },
      saveCredentials: () => Promise.resolve(),
    }

    await makeChaserConsumer(deps)(PAYLOAD, JOB)
    expect(adapterFor).not.toHaveBeenCalled()
  })
})
