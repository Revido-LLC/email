import { describe, expect, it, vi } from 'vitest'
import { FakeLlmClient } from '@revido/core'
import type { AccountContext, AccountCrypto } from '../db/accounts'
import type { ApplyTriageInput, TriageInput } from '../mail/store'
import { makeTriageConsumer, parseTriageResult, type TriageDeps } from './triage'

const passthroughCrypto: AccountCrypto = {
  encrypt: (plaintext) => ({ ct: plaintext, iv: '', tag: '', v: 1 }),
  decrypt: (ciphertext) => ciphertext.ct,
}

function fakeAccount(): AccountContext {
  return {
    accountId: '11111111-1111-1111-1111-111111111111',
    userId: '22222222-2222-2222-2222-222222222222',
    provider: 'gmail',
    email: 'me@example.com',
    dek: new Uint8Array(32),
    creds: { accessToken: 'a', refreshToken: 'r', expiresAt: new Date().toISOString() },
    crypto: passthroughCrypto,
  }
}

const PAYLOAD = {
  accountId: '11111111-1111-1111-1111-111111111111',
  threadId: '33333333-3333-3333-3333-333333333333',
  messageId: '44444444-4444-4444-4444-444444444444',
}

const TRIAGE_INPUT: TriageInput = {
  subject: 'Q3 numbers before Friday',
  from: { name: 'Sam Rivera', email: 'sam@acme.com' },
  to: [{ name: 'Me', email: 'me@example.com' }],
  body: 'Can you review the Q3 numbers before Friday?',
  date: '2026-07-15T00:00:00Z',
}

describe('makeTriageConsumer', () => {
  it('runs Haiku triage, validates strict JSON, and writes the result + usage', async () => {
    const applied: ApplyTriageInput[] = []
    const increments: { userId: string; metric: string }[] = []
    const llm = new FakeLlmClient() // default responder returns triage-shaped JSON

    const deps: TriageDeps = {
      loadAccount: () => Promise.resolve(fakeAccount()),
      mail: {
        getTriageInput: () => Promise.resolve(TRIAGE_INPUT),
        applyTriage: async (input) => {
          applied.push(input)
        },
        increment: async (userId, metric) => {
          increments.push({ userId, metric })
        },
      },
      llm,
    }

    await makeTriageConsumer(deps)(PAYLOAD, {
      id: 'j',
      queue: 'triage',
      payload: PAYLOAD,
      attempts: 0,
      maxAttempts: 5,
    })

    // The LLM request used the cheap tier, strict JSON, and no thinking (disabled).
    const call = llm.calls[0]
    expect(call?.model).toBe('triage')
    expect(call?.responseFormat).toEqual({ type: 'json' })
    expect(call?.thinking).toBeUndefined()
    expect(call?.system).toContain('triage engine')

    expect(applied).toHaveLength(1)
    expect(applied[0]?.threadId).toBe(PAYLOAD.threadId)
    expect(applied[0]?.result).toMatchObject({ category: 'fyi', priority: 'normal', language: 'en' })
    expect(increments).toEqual([
      { userId: '22222222-2222-2222-2222-222222222222', metric: 'ai_enrichments' },
    ])
  })

  it('is a no-op when the message vanished before the job ran', async () => {
    const applyTriage = vi.fn()
    const deps: TriageDeps = {
      loadAccount: () => Promise.resolve(fakeAccount()),
      mail: {
        getTriageInput: () => Promise.resolve(null),
        applyTriage,
        increment: vi.fn(),
      },
      llm: new FakeLlmClient(),
    }
    await makeTriageConsumer(deps)(PAYLOAD, {
      id: 'j',
      queue: 'triage',
      payload: PAYLOAD,
      attempts: 0,
      maxAttempts: 5,
    })
    expect(applyTriage).not.toHaveBeenCalled()
  })
})

describe('parseTriageResult', () => {
  it('accepts a valid TriageResult and rejects a malformed one', () => {
    expect(
      parseTriageResult({
        category: 'to-reply',
        priorityScore: 74,
        priority: 'high',
        tldr: 'x',
        language: 'en',
      }),
    ).toMatchObject({ category: 'to-reply', priorityScore: 74 })

    expect(() => parseTriageResult({ category: 'nope', priorityScore: 999 })).toThrow()
  })
})
