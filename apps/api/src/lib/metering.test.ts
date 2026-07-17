/**
 * Tests for the per-user AI abuse caps (`aiCap` env resolution + `enforceAiCap`
 * threshold behavior). `@revido/db/client` is mocked with a chainable fake query
 * returning a preset month-to-date count.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ rows: [] as { count: number }[], fail: false }))

vi.mock('@revido/db/client', () => {
  class FakeQuery {
    select() {
      return this
    }
    from() {
      return this
    }
    where() {
      return this
    }
    limit() {
      return this
    }
    then(onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) {
      return Promise.resolve(h.rows).then(onOk, onErr)
    }
  }
  return {
    withUser: async (_userId: string, fn: (tx: unknown) => unknown) => {
      if (h.fail) throw new Error('db down')
      return fn(new FakeQuery())
    },
  }
})

const { aiCap, enforceAiCap, UsageMetric } = await import('./metering')

const USER = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  h.rows = []
  h.fail = false
})

describe('aiCap', () => {
  it('reads the metric env var when set', () => {
    expect(aiCap(UsageMetric.aiDrafts, { AI_MONTHLY_CAP_DRAFTS: '50' } as NodeJS.ProcessEnv)).toBe(50)
    expect(aiCap(UsageMetric.chatQueries, { AI_MONTHLY_CAP_CHAT: '7' } as NodeJS.ProcessEnv)).toBe(7)
  })
  it('falls back to the default when unset or unparseable', () => {
    expect(aiCap(UsageMetric.agentCompiles, {} as NodeJS.ProcessEnv)).toBe(200)
    expect(aiCap(UsageMetric.aiDrafts, { AI_MONTHLY_CAP_DRAFTS: 'nope' } as NodeJS.ProcessEnv)).toBe(
      1000,
    )
  })
})

describe('enforceAiCap', () => {
  const env = { AI_MONTHLY_CAP_DRAFTS: '10' } as NodeJS.ProcessEnv

  it('allows a user under the cap', async () => {
    h.rows = [{ count: 9 }]
    await expect(enforceAiCap(USER, UsageMetric.aiDrafts, env)).resolves.toBeUndefined()
  })

  it('throws 429 once the cap is reached', async () => {
    h.rows = [{ count: 10 }]
    await expect(enforceAiCap(USER, UsageMetric.aiDrafts, env)).rejects.toMatchObject({
      status: 429,
      code: 'usage_cap_exceeded',
    })
  })

  it('is a no-op when the cap is disabled (≤ 0)', async () => {
    h.rows = [{ count: 9999 }]
    await expect(
      enforceAiCap(USER, UsageMetric.aiDrafts, { AI_MONTHLY_CAP_DRAFTS: '0' } as NodeJS.ProcessEnv),
    ).resolves.toBeUndefined()
  })

  it('fails open when the counter read errors', async () => {
    h.fail = true
    h.rows = [{ count: 10 }]
    await expect(enforceAiCap(USER, UsageMetric.aiDrafts, env)).resolves.toBeUndefined()
  })
})
