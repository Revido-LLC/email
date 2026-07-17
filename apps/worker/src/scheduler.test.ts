import { describe, expect, it } from 'vitest'
import { consoleLogger } from './queue/runner'
import {
  enqueueDailyDigests,
  enqueueReconcileSweep,
  enqueueWatchRenewals,
  type SchedulerDeps,
} from './scheduler'
import { QUEUE } from './queue/jobs'

function harness(): {
  deps: SchedulerDeps
  enqueued: { queue: string; payload: unknown }[]
} {
  const enqueued: { queue: string; payload: unknown }[] = []
  const deps: SchedulerDeps = {
    jobs: {
      enqueue: async (queue, payload) => {
        enqueued.push({ queue, payload })
      },
    },
    schedule: {
      listAccounts: () =>
        Promise.resolve([
          { id: 'a1', provider: 'gmail' },
          { id: 'a2', provider: 'outlook' },
          { id: 'a3', provider: 'gmail' },
        ]),
      listUserIds: () => Promise.resolve(['u1', 'u2']),
    },
    logger: consoleLogger,
  }
  return { deps, enqueued }
}

describe('scheduler enqueue functions', () => {
  it('enqueues a reconcile sweep for every account', async () => {
    const h = harness()
    const count = await enqueueReconcileSweep(h.deps)
    expect(count).toBe(3)
    expect(h.enqueued.every((e) => e.queue === QUEUE.reconcile)).toBe(true)
    expect(h.enqueued.map((e) => e.payload)).toEqual([
      { accountId: 'a1' },
      { accountId: 'a2' },
      { accountId: 'a3' },
    ])
  })

  it('enqueues watch renewals filtered by provider', async () => {
    const h = harness()
    const count = await enqueueWatchRenewals(h.deps, 'gmail')
    expect(count).toBe(2)
    expect(h.enqueued.map((e) => e.payload)).toEqual([{ accountId: 'a1' }, { accountId: 'a3' }])
    expect(h.enqueued.every((e) => e.queue === QUEUE.renewWatch)).toBe(true)
  })

  it('enqueues a digest per user', async () => {
    const h = harness()
    const count = await enqueueDailyDigests(h.deps)
    expect(count).toBe(2)
    expect(h.enqueued.map((e) => e.payload)).toEqual([{ userId: 'u1' }, { userId: 'u2' }])
  })
})
