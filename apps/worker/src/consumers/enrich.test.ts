import { describe, expect, it, vi } from 'vitest'
import { FakeLlmClient } from '@revido/core'
import type { AccountContext, AccountCrypto } from '../db/accounts'
import type {
  ApplySummaryInput,
  CreateCommitmentInput,
  CreateReminderInput,
  ThreadForSummary,
} from '../mail/store'
import {
  makeSummaryConsumer,
  parseFactExtraction,
  parseFollowUpDetection,
  type SummaryDeps,
} from './enrich'

const passthroughCrypto: AccountCrypto = {
  encrypt: (plaintext) => ({ ct: plaintext, iv: '', tag: '', v: 1 }),
  decrypt: (ciphertext) => ciphertext.ct,
}

const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111'
const USER_ID = '22222222-2222-2222-2222-222222222222'
const THREAD_ID = '33333333-3333-3333-3333-333333333333'

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

const PAYLOAD = { accountId: ACCOUNT_ID, threadId: THREAD_ID }
const JOB = { id: 'j', queue: 'summary', payload: PAYLOAD, attempts: 0, maxAttempts: 5 }

/** A thread the user participated in (has an outbound message), so detection runs. */
function threadWithSent(): ThreadForSummary {
  return {
    subject: 'Q3 numbers',
    priority: 'normal',
    outputLanguage: 'en',
    detectedLanguage: 'en',
    messages: [
      {
        from: { name: 'Sam', email: 'sam@acme.com' },
        date: '2026-07-14T00:00:00Z',
        body: 'Can you send the Q3 numbers?',
        outbound: false,
      },
      {
        from: { name: 'Me', email: 'me@example.com' },
        date: '2026-07-15T00:00:00Z',
        body: "I'll get the Q3 numbers to you Friday.",
        outbound: true,
      },
    ],
  }
}

/** Return detection JSON for JSON requests, plain summary text otherwise. */
const detectionLlm = new FakeLlmClient({
  respond: (req) =>
    req.responseFormat?.type === 'json'
      ? JSON.stringify({
          awaitingReply: true,
          chaserDraft: 'Just following up on the Q3 numbers.',
          commitments: [{ text: "Send Q3 numbers by Friday", dueAt: '2026-07-18' }],
        })
      : 'Sam asked for Q3 numbers; you promised them by Friday.',
})

describe('makeSummaryConsumer follow-up detection', () => {
  it('writes a reminder + commitment when the model detects awaiting-reply and a promise', async () => {
    const summaries: ApplySummaryInput[] = []
    const reminders: CreateReminderInput[] = []
    const commitments: CreateCommitmentInput[] = []
    const increments: string[] = []

    const deps: SummaryDeps = {
      loadAccount: () => Promise.resolve(fakeAccount()),
      mail: {
        getThread: () => Promise.resolve(threadWithSent()),
        applySummary: async (input) => {
          summaries.push(input)
        },
        createReminder: async (input) => {
          reminders.push(input)
        },
        createCommitment: async (input) => {
          commitments.push(input)
        },
        increment: async (_userId, metric) => {
          increments.push(metric)
        },
      },
      llm: detectionLlm,
    }

    await makeSummaryConsumer(deps)(PAYLOAD, JOB)

    expect(summaries).toHaveLength(1)
    expect(reminders).toHaveLength(1)
    expect(reminders[0]).toMatchObject({ kind: 'follow-up', threadId: THREAD_ID })
    expect(reminders[0]?.draftReply).toContain('following up')
    expect(commitments).toHaveLength(1)
    expect(commitments[0]?.text).toContain('Q3')
    expect(increments).toContain('ai_enrichments')
  })

  it('does not run detection on a thread the user never participated in', async () => {
    const createReminder = vi.fn()
    const inboundOnly: ThreadForSummary = { ...threadWithSent(), messages: [threadWithSent().messages[0]!] }
    const deps: SummaryDeps = {
      loadAccount: () => Promise.resolve(fakeAccount()),
      mail: {
        getThread: () => Promise.resolve(inboundOnly),
        applySummary: async () => {},
        createReminder,
        createCommitment: vi.fn(),
        increment: vi.fn(),
      },
      llm: detectionLlm,
    }

    await makeSummaryConsumer(deps)(PAYLOAD, JOB)
    expect(createReminder).not.toHaveBeenCalled()
  })
})

describe('parseFollowUpDetection', () => {
  it('accepts a valid shape and rejects a malformed one', () => {
    expect(parseFollowUpDetection({ awaitingReply: true, commitments: [] })).toMatchObject({
      awaitingReply: true,
    })
    // A triage-shaped object (no follow-up fields) coerces to a benign default.
    expect(parseFollowUpDetection({ category: 'fyi' })).toMatchObject({
      awaitingReply: false,
      commitments: [],
    })
    expect(parseFollowUpDetection('not json')).toBeNull()
  })
})

/** An inbound-only thread: no outbound message ⇒ follow-up detection is skipped, so
 *  the extraction JSON call is the only strict-JSON call the consumer makes. */
function inboundOnlyThread(): ThreadForSummary {
  return {
    subject: 'Your order shipped',
    priority: 'normal',
    outputLanguage: 'en',
    detectedLanguage: 'en',
    messages: [
      {
        from: { name: 'Shop', email: 'orders@shop.test' },
        date: '2026-07-15T00:00:00Z',
        body: 'Total $249.00, due 2026-08-01. Track at https://x.test/t . Unsubscribe: https://x.test/u',
        outbound: false,
      },
    ],
  }
}

/** Return the given extraction JSON for strict-JSON requests, plain summary text otherwise. */
function extractionLlm(json: unknown): FakeLlmClient {
  return new FakeLlmClient({
    respond: (req) =>
      req.responseFormat?.type === 'json' ? JSON.stringify(json) : 'A concise summary.',
  })
}

describe('makeSummaryConsumer fact extraction', () => {
  function depsWith(llm: FakeLlmClient, sink: ApplySummaryInput[]): SummaryDeps {
    return {
      loadAccount: () => Promise.resolve(fakeAccount()),
      mail: {
        getThread: () => Promise.resolve(inboundOnlyThread()),
        applySummary: async (input) => {
          sink.push(input)
        },
        createReminder: vi.fn(),
        createCommitment: vi.fn(),
        increment: vi.fn(),
      },
      llm,
    }
  }

  it('mines structured facts and writes them alongside the summary', async () => {
    const summaries: ApplySummaryInput[] = []
    const llm = extractionLlm({
      facts: [
        { type: 'amount', label: 'Total', value: '$249.00' },
        { type: 'date', label: 'Payment due', value: '2026-08-01' },
        { type: 'link', label: 'Unsubscribe', value: 'Unsubscribe', href: 'https://x.test/u' },
      ],
    })
    await makeSummaryConsumer(depsWith(llm, summaries))(PAYLOAD, JOB)

    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.summary).toBe('A concise summary.')
    // type/href/label/value pass through to the store as-is (the store encrypts label/value/href).
    expect(summaries[0]?.facts).toEqual([
      { type: 'amount', label: 'Total', value: '$249.00' },
      { type: 'date', label: 'Payment due', value: '2026-08-01' },
      { type: 'link', label: 'Unsubscribe', value: 'Unsubscribe', href: 'https://x.test/u' },
    ])
  })

  it('writes no facts when the extraction is empty', async () => {
    const summaries: ApplySummaryInput[] = []
    await makeSummaryConsumer(depsWith(extractionLlm({ facts: [] }), summaries))(PAYLOAD, JOB)
    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.facts).toEqual([])
  })

  it('does not crash on malformed extraction JSON — the summary still lands with no facts', async () => {
    const summaries: ApplySummaryInput[] = []
    const llm = new FakeLlmClient({
      respond: (req) => (req.responseFormat?.type === 'json' ? 'definitely {not valid' : 'Summary.'),
    })
    await expect(
      makeSummaryConsumer(depsWith(llm, summaries))(PAYLOAD, JOB),
    ).resolves.toBeUndefined()
    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.summary).toBe('Summary.')
    expect(summaries[0]?.facts).toEqual([])
  })
})

describe('parseFactExtraction', () => {
  it('keeps well-formed facts, skips malformed ones, and coerces junk to none', () => {
    expect(
      parseFactExtraction({
        facts: [
          { type: 'amount', label: 'Total', value: '$10' },
          { type: 'bogus', label: 'x', value: 'y' }, // unknown type → skipped
          { type: 'date', label: '', value: '2026-01-01' }, // empty label → skipped
          { type: 'link', label: 'U', value: 'U', href: 'https://x.test' },
        ],
      }),
    ).toEqual([
      { type: 'amount', label: 'Total', value: '$10' },
      { type: 'link', label: 'U', value: 'U', href: 'https://x.test' },
    ])
    expect(parseFactExtraction({ facts: [] })).toEqual([])
    expect(parseFactExtraction({ nope: true })).toEqual([]) // missing facts ⇒ default []
    expect(parseFactExtraction('not json')).toEqual([])
    expect(parseFactExtraction(null)).toEqual([])
  })
})
