import { describe, expect, it } from 'vitest'
import type { AccountCrypto, UserContext } from '../db/accounts'
import type { OutgoingEmail } from '../mail/email'
import type { DigestData } from '../mail/store'
import { makeDigestConsumer, renderDigest, renderDigestText, type DigestDeps } from './digest'

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
        items: [
          { threadId: 'thread-contract', subject: 'Contract review', sender: 'legal@acme.com' },
        ],
      },
    ],
    reminders: [
      {
        threadId: 'thread-vendor',
        subject: 'Ping the vendor',
        sender: 'vendor@acme.com',
        dueAt: '2026-07-18',
      },
    ],
    commitments: [
      {
        threadId: 'thread-deck',
        text: 'Send the deck',
        counterpart: 'sam@acme.com',
        dueAt: '2026-07-19',
      },
    ],
    agentsHandled: 2,
    ...overrides,
  }
}

function harness(data: DigestData): {
  deps: DigestDeps
  sent: OutgoingEmail[]
  increments: string[]
} {
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
    expect(html).toContain('Your inbox, distilled to 3 moves')
    expect(html).toContain('YOUR INBOX, DISTILLED')
    expect(html).toContain('>Reply now<')
    expect(html).toContain('Contract review')
    expect(html).toContain('Open email')
    expect(html).toContain('/app/thread/thread-contract')
    expect(html).toContain('Open the shortlist')
  })

  it('renders the Dutch template when the user prefers nl', async () => {
    const html = await renderDigest(digestData({ outputLanguage: 'nl' }), '2026-07-17')
    expect(html).toContain('Je inbox, teruggebracht tot 3 acties')
    expect(html).toContain('JE INBOX, TERUGGEBRACHT')
    expect(html).toContain('>Nu antwoorden<')
  })

  it('caps the HTML at three replies and two due items', async () => {
    const html = await renderDigest(
      digestData({
        bundles: [
          {
            category: 'to-reply',
            count: 20,
            items: Array.from({ length: 6 }, (_, i) => ({
              threadId: `thread-reply-${i + 1}`,
              subject: `Reply ${i + 1}`,
              sender: 'Sam',
            })),
          },
          {
            category: 'notifications',
            count: 40,
            items: [{ threadId: 'thread-bot', subject: 'Do not show', sender: 'Bot' }],
          },
        ],
        reminders: Array.from({ length: 4 }, (_, i) => ({
          threadId: `thread-reminder-${i + 1}`,
          subject: `Reminder ${i + 1}`,
          sender: 'Alex',
          dueAt: `2026-07-${18 + i}`,
        })),
        commitments: Array.from({ length: 4 }, (_, i) => ({
          threadId: `thread-commitment-${i + 1}`,
          text: `Commitment ${i + 1}`,
          counterpart: 'Taylor',
          dueAt: `2026-07-${22 + i}`,
        })),
      }),
      '2026-07-17',
    )
    expect(html).toContain('Reply 1')
    expect(html).toContain('Reply 3')
    expect(html).not.toContain('Reply 4')
    expect(html).toContain('Reminder 1')
    expect(html).toContain('Reminder 2')
    expect(html).not.toContain('Reminder 3')
    expect(html).not.toContain('Do not show')
  })

  it('renders a useful plain-text fallback', () => {
    const text = renderDigestText(digestData(), '2026-07-17')
    expect(text).toContain('⚡ Your Revido brief: 3 priorities')
    expect(text).toContain('REPLY: Contract review')
    expect(text).toContain('/app/thread/thread-contract')
    expect(text).toContain('https://email.revido.co/app')
  })
})

describe('makeDigestConsumer', () => {
  it('builds the digest and sends it via the injected sender', async () => {
    const h = harness(digestData())
    await makeDigestConsumer(h.deps)(PAYLOAD, JOB)

    expect(h.sent).toHaveLength(1)
    expect(h.sent[0]?.to).toBe('me@example.com')
    expect(h.sent[0]?.subject).toBe('⚡ Your Revido brief: 3 priorities')
    expect(h.sent[0]?.html.length).toBeGreaterThan(0)
    expect(h.sent[0]?.html).toContain('Contract review')
    expect(h.sent[0]?.text).toContain('REPLY: Contract review')
    expect(h.increments).toEqual(['digests'])
  })

  it('does not send when the user has no delivery address', async () => {
    const h = harness(digestData({ email: '' }))
    await makeDigestConsumer(h.deps)(PAYLOAD, JOB)
    expect(h.sent).toHaveLength(0)
  })

  it('does not send a digest when there is nothing actionable', async () => {
    const h = harness(
      digestData({
        bundles: [{ category: 'notifications', count: 12, items: [] }],
        reminders: [],
        commitments: [],
      }),
    )
    await makeDigestConsumer(h.deps)(PAYLOAD, JOB)
    expect(h.sent).toHaveLength(0)
  })
})
