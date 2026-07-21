import { describe, expect, it } from 'vitest'
import type { OutboundMessage, ProviderAdapter, ProviderCredentials } from '@revido/core'
import type { AccountContext, AccountCrypto } from '../db/accounts'
import type { ForwardSourceData } from '../mail/store'
import type { ClaimedJob } from '../queue/store'
import { makeForwardConsumer, type ForwardDeps } from './forward'

const passthroughCrypto: AccountCrypto = {
  encrypt: (plaintext) => ({ ct: plaintext, iv: '', tag: '', v: 1 }),
  decrypt: (ciphertext) => ciphertext.ct,
}

const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111'
const USER_ID = '22222222-2222-2222-2222-222222222222'
const SOURCE_ID = '44444444-4444-4444-4444-444444444444'
const PAYLOAD = { userId: USER_ID, accountId: ACCOUNT_ID, sourceMessageId: SOURCE_ID, to: 'accounting@revido.co' }
const JOB: ClaimedJob = { id: 'j', queue: 'forward', payload: PAYLOAD, attempts: 0, maxAttempts: 5 }

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

function source(overrides: Partial<ForwardSourceData> = {}): ForwardSourceData {
  return {
    subject: 'Invoice #4471',
    html: '<p>Please find the invoice attached.</p>',
    text: 'Please find the invoice attached.',
    attachments: [{ name: 'invoice.pdf', mime: 'application/pdf', content: new Uint8Array([1, 2, 3]) }],
    ...overrides,
  }
}

function makeDeps(over: {
  src?: ForwardSourceData | null
  sent?: OutboundMessage
} = {}): { deps: ForwardDeps; sends: OutboundMessage[] } {
  const sends: OutboundMessage[] = []
  const adapter: Pick<ProviderAdapter, 'connect' | 'send'> = {
    connect: async (c: ProviderCredentials) => c,
    send: async (_c, msg) => {
      sends.push(msg)
      return { providerMessageId: 'fwd-1' }
    },
  }
  const deps: ForwardDeps = {
    loadAccount: async () => fakeAccount(),
    adapterFor: () => adapter as ProviderAdapter,
    mail: { getForwardSource: async () => (over.src === undefined ? source() : over.src) },
    saveCredentials: async () => {},
  }
  return { deps, sends }
}

describe('forward consumer', () => {
  it('forwards the source message + attachments to the destination with a Fwd: subject', async () => {
    const { deps, sends } = makeDeps()
    await makeForwardConsumer(deps)(PAYLOAD, JOB)
    expect(sends).toHaveLength(1)
    const msg = sends[0]!
    expect(msg.to).toEqual([{ name: '', email: 'accounting@revido.co' }])
    expect(msg.subject).toBe('Fwd: Invoice #4471')
    expect(msg.attachments).toEqual([
      { name: 'invoice.pdf', mime: 'application/pdf', content: new Uint8Array([1, 2, 3]) },
    ])
    // A forward is a fresh message, not a reply — no threading header.
    expect(msg.inReplyToProviderMessageId).toBeUndefined()
  })

  it('does nothing when the source message is gone', async () => {
    const { deps, sends } = makeDeps({ src: null })
    await makeForwardConsumer(deps)(PAYLOAD, JOB)
    expect(sends).toHaveLength(0)
  })

  it('rejects an invalid payload', async () => {
    const { deps } = makeDeps()
    await expect(makeForwardConsumer(deps)({ to: 'not-an-email' }, JOB)).rejects.toThrow()
  })
})
