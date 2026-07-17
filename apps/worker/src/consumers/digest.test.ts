import { describe, expect, it } from 'vitest'
import type { AccountCrypto, UserContext } from '../db/accounts'
import type { OutgoingEmail } from '../mail/email'
import type { DigestData } from '../mail/store'
import { makeDigestConsumer, renderDigest, type DigestDeps } from './digest'

const passthroughCrypto: AccountCrypto = {
  encrypt: (plaintext) => ({ ct: plaintext, iv: '', tag: '', v: 1 }),
  decrypt: (ciphertext) => ciphertext.ct,
}

const USER_ID = '22222222-2222-2222-2222-222222222222'
const PAYLOAD = { userId: USER_ID }
const JOB = { id: 'j', queue: 'digest', payload: PAYLOAD, attempts: 0, maxAttempts: 5 }

function fakeUser(): UserContext {
  return { userId: USER_ID, dek: new Uint8Array(32), crypto: passthroughCrypto }
}

function digestData(overrides: Partial<DigestData> = {}): DigestData {
  return {
    email: 'me@example.com',
    name: 'Ada',
    outputLanguage: 'en',
    bundles: [
      {
        category: 'to-reply',
        count: 3,
        items: [{ subject: 'Contract review', sender: 'legal@acme.com' }],
      },
    ],
    reminders: [{ subject: 'Ping the vendor', sender: 'vendor@acme.com', dueAt: '2026-07-18' }],
    commitments: [{ text: 'Send the deck', counterpart: 'sam@acme.com', dueAt: '2026-07-19' }],
    agentsHandled: 2,
    ...overrides,
  }
}

function harness(data: DigestData): { deps: DigestDeps; sent: OutgoingEmail[]; increments: string[] } {
  const sent: OutgoingEmail[] = []
  const increments: string[] = []
  const deps: DigestDeps = {
    loadUser: () => Promise.resolve(fakeUser()),
    mail: {
      getDigestData: () => Promise.resolve(data),
      increment: async (_userId, metric) => {
        increments.push(metric)
      },
    },
    email: {
      send: async (email) => {
        sent.push(email)
      },
    },
    now: () => new Date('2026-07-17T07:00:00Z'),
  }
  return { deps, sent, increments }
}

describe('renderDigest', () => {
  it('renders non-empty HTML with the English labels', async () => {
    const html = await renderDigest(digestData(), '2026-07-17')
    expect(html.length).toBeGreaterThan(0)
    expect(html).toContain('To reply')
    expect(html).toContain('Contract review')
    expect(html).toContain('Ada')
  })

  it('renders the Dutch template when the user prefers nl', async () => {
    const html = await renderDigest(digestData({ outputLanguage: 'nl' }), '2026-07-17')
    expect(html).toContain('Beantwoorden')
  })
})

describe('makeDigestConsumer', () => {
  it('builds the digest and sends it via the injected sender', async () => {
    const h = harness(digestData())
    await makeDigestConsumer(h.deps)(PAYLOAD, JOB)

    expect(h.sent).toHaveLength(1)
    expect(h.sent[0]?.to).toBe('me@example.com')
    expect(h.sent[0]?.subject).toBe('Your daily digest — 2026-07-17')
    expect(h.sent[0]?.html.length).toBeGreaterThan(0)
    expect(h.sent[0]?.html).toContain('Contract review')
    expect(h.increments).toEqual(['digests'])
  })

  it('does not send when the user has no delivery address', async () => {
    const h = harness(digestData({ email: '' }))
    await makeDigestConsumer(h.deps)(PAYLOAD, JOB)
    expect(h.sent).toHaveLength(0)
  })
})
