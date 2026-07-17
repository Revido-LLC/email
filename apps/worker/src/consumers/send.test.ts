import { describe, expect, it, vi } from 'vitest'
import type { OutboundMessage, ProviderAdapter, ProviderCredentials } from '@revido/core'
import type { AccountContext, AccountCrypto } from '../db/accounts'
import type { OutboundMessageData } from '../mail/store'
import type { ClaimedJob } from '../queue/store'
import { makeSendConsumer, type SendDeps } from './send'

const passthroughCrypto: AccountCrypto = {
  encrypt: (plaintext) => ({ ct: plaintext, iv: '', tag: '', v: 1 }),
  decrypt: (ciphertext) => ciphertext.ct,
}

const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111'
const USER_ID = '22222222-2222-2222-2222-222222222222'
const MESSAGE_ID = '44444444-4444-4444-4444-444444444444'
const PAYLOAD = { accountId: ACCOUNT_ID, messageId: MESSAGE_ID }
const JOB: ClaimedJob = { id: 'j', queue: 'send', payload: PAYLOAD, attempts: 0, maxAttempts: 5 }

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

function outbound(overrides: Partial<OutboundMessageData> = {}): OutboundMessageData {
  return {
    to: [{ name: 'Sam Rivera', email: 'sam@acme.com' }],
    cc: [{ name: 'Finance', email: 'finance@acme.com' }],
    bcc: [],
    subject: 'Re: Q3 numbers',
    html: '<p>On it.</p>',
    text: 'On it.',
    inReplyToProviderMessageId: 'parent-1',
    ...overrides,
  }
}

/** A ProviderAdapter whose only live methods are connect + send. */
function fakeAdapter(opts: {
  sent: OutboundMessage[]
  connectReturns?: (creds: ProviderCredentials) => ProviderCredentials
  providerMessageId?: string
}): ProviderAdapter {
  const unsupported = (name: string) => (): never => {
    throw new Error(`unexpected adapter call: ${name}`)
  }
  return {
    provider: 'gmail',
    connect: (creds) => Promise.resolve((opts.connectReturns ?? ((c) => c))(creds)),
    send: (_creds, message) => {
      opts.sent.push(message)
      return Promise.resolve({ providerMessageId: opts.providerMessageId ?? 'sent-1' })
    },
    backfill: unsupported('backfill'),
    incremental: unsupported('incremental'),
    getMessage: unsupported('getMessage'),
    watch: unsupported('watch'),
    renewWatch: unsupported('renewWatch'),
    unsubscribe: unsupported('unsubscribe'),
  }
}

describe('makeSendConsumer', () => {
  it('decrypts the outbound row, sends it with threading, and records the provider id', async () => {
    const sent: OutboundMessage[] = []
    const marked: { messageId: string; providerMessageId: string }[] = []
    const deps: SendDeps = {
      loadAccount: () => Promise.resolve(fakeAccount()),
      adapterFor: () => fakeAdapter({ sent, providerMessageId: 'sent-42' }),
      mail: {
        getOutboundMessage: () => Promise.resolve(outbound()),
        markSent: async (_userId, messageId, providerMessageId) => {
          marked.push({ messageId, providerMessageId })
        },
      },
      saveCredentials: vi.fn(() => Promise.resolve()),
    }

    await makeSendConsumer(deps)(PAYLOAD, JOB)

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      to: [{ email: 'sam@acme.com' }],
      cc: [{ email: 'finance@acme.com' }],
      subject: 'Re: Q3 numbers',
      html: '<p>On it.</p>',
      inReplyToProviderMessageId: 'parent-1',
    })
    expect(marked).toEqual([{ messageId: MESSAGE_ID, providerMessageId: 'sent-42' }])
    expect(deps.saveCredentials).not.toHaveBeenCalled()
  })

  it('forwards decrypted inline attachments to the adapter', async () => {
    const sent: OutboundMessage[] = []
    const content = new Uint8Array([1, 2, 3, 4])
    const deps: SendDeps = {
      loadAccount: () => Promise.resolve(fakeAccount()),
      adapterFor: () => fakeAdapter({ sent }),
      mail: {
        getOutboundMessage: () =>
          Promise.resolve(outbound({ attachments: [{ name: 'q3.pdf', mime: 'application/pdf', content }] })),
        markSent: async () => {},
      },
      saveCredentials: vi.fn(() => Promise.resolve()),
    }

    await makeSendConsumer(deps)(PAYLOAD, JOB)

    expect(sent[0]!.attachments).toEqual([{ name: 'q3.pdf', mime: 'application/pdf', content }])
  })

  it('is a no-op when the message was withdrawn before the deferred send ran', async () => {
    const send = vi.fn()
    const markSent = vi.fn()
    const deps: SendDeps = {
      loadAccount: () => Promise.resolve(fakeAccount()),
      adapterFor: () => {
        const a = fakeAdapter({ sent: [] })
        a.send = send
        return a
      },
      mail: {
        getOutboundMessage: () => Promise.resolve(null),
        markSent,
      },
      saveCredentials: vi.fn(() => Promise.resolve()),
    }

    await makeSendConsumer(deps)(PAYLOAD, JOB)
    expect(send).not.toHaveBeenCalled()
    expect(markSent).not.toHaveBeenCalled()
  })

  it('persists refreshed credentials only when connect returns a new token set', async () => {
    const sent: OutboundMessage[] = []
    const refreshed: ProviderCredentials = {
      accessToken: 'fresh',
      refreshToken: 'r',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    }
    const saveCredentials = vi.fn((_account: AccountContext, _creds: ProviderCredentials) =>
      Promise.resolve(),
    )
    const deps: SendDeps = {
      loadAccount: () => Promise.resolve(fakeAccount()),
      adapterFor: () => fakeAdapter({ sent, connectReturns: () => refreshed }),
      mail: {
        getOutboundMessage: () => Promise.resolve(outbound()),
        markSent: () => Promise.resolve(),
      },
      saveCredentials,
    }

    await makeSendConsumer(deps)(PAYLOAD, JOB)
    expect(saveCredentials).toHaveBeenCalledTimes(1)
    expect(saveCredentials.mock.calls[0]?.[1]).toBe(refreshed)
  })

  it('rejects a malformed payload before touching the adapter', async () => {
    const loadAccount = vi.fn(() => Promise.resolve(fakeAccount()))
    const deps: SendDeps = {
      loadAccount,
      adapterFor: () => fakeAdapter({ sent: [] }),
      mail: { getOutboundMessage: () => Promise.resolve(null), markSent: () => Promise.resolve() },
      saveCredentials: () => Promise.resolve(),
    }
    await expect(
      makeSendConsumer(deps)({ accountId: 'not-a-uuid', messageId: MESSAGE_ID }, JOB),
    ).rejects.toThrow()
    expect(loadAccount).not.toHaveBeenCalled()
  })
})
