import { describe, expect, it, vi } from 'vitest'
import type { LlmBatchResultItem, LlmResult, TriageResult } from '@revido/core'
import type { AccountContext, AccountCrypto } from '../db/accounts'
import type { ApplyTriageInput } from '../mail/store'
import type { Logger } from '../queue/runner'
import { QUEUE } from '../queue/jobs'
import { makeTriageBatchConsumer, type TriageBatchDeps } from './triage-batch'

const passthroughCrypto: AccountCrypto = {
  encrypt: (plaintext) => ({ ct: plaintext, iv: '', tag: '', v: 1 }),
  decrypt: (ciphertext) => ciphertext.ct,
}

const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111'
const USER_ID = '22222222-2222-2222-2222-222222222222'
const THREAD_A = '33333333-3333-3333-3333-333333333333'
const THREAD_B = '44444444-4444-4444-4444-444444444444'
const MSG_1 = '55555555-5555-5555-5555-555555555555'
const MSG_2 = '66666666-6666-6666-6666-666666666666'
const MSG_3 = '77777777-7777-7777-7777-777777777777'

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

function triageResult(category: TriageResult['category']): TriageResult {
  return { category, priorityScore: 40, priority: 'normal', tldr: 'x', language: 'en' }
}

/** A succeeded batch result item whose parsed JSON is a valid TriageResult. */
function succeeded(customId: string, result: TriageResult): LlmBatchResultItem {
  const llmResult: LlmResult = {
    text: JSON.stringify(result),
    json: result,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
    stopReason: 'end_turn',
    model: 'claude-haiku-4-5',
  }
  return { customId, status: 'succeeded', result: llmResult }
}

const silentLogger: Logger = { info: () => {}, error: () => {} }

interface Harness {
  deps: TriageBatchDeps
  applied: ApplyTriageInput[]
  increments: { userId: string; metric: string }[]
  enqueued: { queue: string; payload: unknown; runAt?: Date }[]
  pollBatch: ReturnType<typeof vi.fn>
  collectBatch: ReturnType<typeof vi.fn>
}

function harness(opts: {
  status: 'in_progress' | 'canceling' | 'ended'
  results?: Map<string, LlmBatchResultItem>
  logger?: Logger
}): Harness {
  const applied: ApplyTriageInput[] = []
  const increments: { userId: string; metric: string }[] = []
  const enqueued: { queue: string; payload: unknown; runAt?: Date }[] = []

  const pollBatch = vi.fn(async () => ({ status: opts.status }))
  const collectBatch = vi.fn(async () => opts.results ?? new Map<string, LlmBatchResultItem>())

  const deps: TriageBatchDeps = {
    loadAccount: () => Promise.resolve(fakeAccount()),
    mail: {
      applyTriage: async (input) => {
        applied.push(input)
      },
      increment: async (userId, metric) => {
        increments.push({ userId, metric })
      },
    },
    llm: { pollBatch, collectBatch },
    jobs: {
      enqueue: async (queue, payload, o) => {
        enqueued.push({ queue, payload, runAt: o?.runAt })
      },
    },
    logger: opts.logger ?? silentLogger,
    now: () => new Date('2026-07-17T00:00:00Z'),
    pollDelayMs: 60_000,
  }
  return { deps, applied, increments, enqueued, pollBatch, collectBatch }
}

function job(payload: unknown) {
  return { id: 'j', queue: QUEUE.triageBatch, payload, attempts: 0, maxAttempts: 5 }
}

const BASE_PAYLOAD = {
  accountId: ACCOUNT_ID,
  batchId: 'batch-1',
  items: [
    { messageId: MSG_1, threadId: THREAD_A },
    { messageId: MSG_2, threadId: THREAD_A },
    { messageId: MSG_3, threadId: THREAD_B },
  ],
}

describe('makeTriageBatchConsumer', () => {
  it('re-enqueues itself and persists nothing while the batch is still processing', async () => {
    const h = harness({ status: 'in_progress' })

    await makeTriageBatchConsumer(h.deps)(BASE_PAYLOAD, job(BASE_PAYLOAD))

    expect(h.collectBatch).not.toHaveBeenCalled()
    expect(h.applied).toHaveLength(0)
    expect(h.increments).toHaveLength(0)

    const reschedules = h.enqueued.filter((e) => e.queue === QUEUE.triageBatch)
    expect(reschedules).toHaveLength(1)
    expect(reschedules[0]?.payload).toEqual(BASE_PAYLOAD)
    // Delayed re-poll (now + 60s), never immediate.
    expect(reschedules[0]?.runAt).toEqual(new Date('2026-07-17T00:01:00Z'))
    expect(h.enqueued.some((e) => e.queue === QUEUE.summary)).toBe(false)
  })

  it('collects an ENDED batch, persists each result by custom_id, meters, and fans out summary per thread', async () => {
    // Results arrive UNORDERED (MSG_3 first) — the consumer keys by custom_id, not position.
    const results = new Map<string, LlmBatchResultItem>([
      [MSG_3, succeeded(MSG_3, triageResult('promotions'))],
      [MSG_1, succeeded(MSG_1, triageResult('to-reply'))],
      [MSG_2, succeeded(MSG_2, triageResult('fyi'))],
    ])
    const h = harness({ status: 'ended', results })

    await makeTriageBatchConsumer(h.deps)(BASE_PAYLOAD, job(BASE_PAYLOAD))

    // Every message persisted, mapped to the RIGHT thread despite the shuffled order.
    expect(h.applied).toHaveLength(3)
    const byMessage = new Map(h.applied.map((a) => [a.messageId, a]))
    expect(byMessage.get(MSG_1)?.threadId).toBe(THREAD_A)
    expect(byMessage.get(MSG_1)?.result.category).toBe('to-reply')
    expect(byMessage.get(MSG_2)?.threadId).toBe(THREAD_A)
    expect(byMessage.get(MSG_3)?.threadId).toBe(THREAD_B)
    expect(byMessage.get(MSG_3)?.result.category).toBe('promotions')

    // One usage increment per persisted result.
    expect(h.increments).toHaveLength(3)
    expect(h.increments.every((i) => i.metric === 'ai_enrichments' && i.userId === USER_ID)).toBe(true)

    // One summary per DISTINCT freshly-triaged thread (A once, B once) — deduped.
    const summaries = h.enqueued.filter((e) => e.queue === QUEUE.summary)
    expect(summaries.map((s) => s.payload)).toEqual([
      { accountId: ACCOUNT_ID, threadId: THREAD_A },
      { accountId: ACCOUNT_ID, threadId: THREAD_B },
    ])
    // A finished batch never reschedules itself.
    expect(h.enqueued.some((e) => e.queue === QUEUE.triageBatch)).toBe(false)
  })

  it('skips a missing / errored / invalid custom_id without failing the rest of the batch', async () => {
    const results = new Map<string, LlmBatchResultItem>([
      [MSG_1, succeeded(MSG_1, triageResult('to-reply'))],
      // MSG_2 errored provider-side.
      [MSG_2, { customId: MSG_2, status: 'errored', error: 'overloaded' }],
      // MSG_3 is entirely absent from the result set.
    ])
    const errors: unknown[][] = []
    const logger: Logger = { info: () => {}, error: (_msg, meta) => errors.push([meta]) }
    const h = harness({ status: 'ended', results, logger })

    await makeTriageBatchConsumer(h.deps)(BASE_PAYLOAD, job(BASE_PAYLOAD))

    // Only the healthy message is persisted + metered.
    expect(h.applied.map((a) => a.messageId)).toEqual([MSG_1])
    expect(h.increments).toHaveLength(1)
    // Only THREAD_A (MSG_1's thread) is summarized; the errored/missing pair is skipped.
    const summaries = h.enqueued.filter((e) => e.queue === QUEUE.summary)
    expect(summaries.map((s) => s.payload)).toEqual([{ accountId: ACCOUNT_ID, threadId: THREAD_A }])
    // Both the errored and the missing item were logged (2 skips).
    expect(errors).toHaveLength(2)
  })

  it('skips an item whose result JSON fails TriageResult validation', async () => {
    const badResult: LlmResult = {
      text: '{}',
      json: { category: 'nope', priorityScore: 999 },
      usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
      stopReason: 'end_turn',
      model: 'claude-haiku-4-5',
    }
    const results = new Map<string, LlmBatchResultItem>([
      [MSG_1, { customId: MSG_1, status: 'succeeded', result: badResult }],
      [MSG_2, succeeded(MSG_2, triageResult('fyi'))],
      [MSG_3, succeeded(MSG_3, triageResult('newsletters'))],
    ])
    const h = harness({ status: 'ended', results })

    await makeTriageBatchConsumer(h.deps)(BASE_PAYLOAD, job(BASE_PAYLOAD))

    // MSG_1 dropped on validation; the others still land.
    expect(h.applied.map((a) => a.messageId).sort()).toEqual([MSG_2, MSG_3].sort())
    expect(h.increments).toHaveLength(2)
  })
})
