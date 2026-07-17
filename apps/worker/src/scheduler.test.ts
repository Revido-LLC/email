import { describe, expect, it, vi } from 'vitest'
import type { Logger } from './queue/runner'
import { consoleLogger } from './queue/runner'
import {
  CRON_EXPRESSIONS,
  enqueueDailyDigests,
  enqueueReconcileSweep,
  enqueueScheduledAgentRuns,
  enqueueVoiceProfiles,
  enqueueWatchRenewals,
  startScheduler,
  type CronScheduler,
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
      listScheduledAgents: () =>
        Promise.resolve([
          { id: 'ag1', userId: 'u1' },
          { id: 'ag2', userId: 'u2' },
        ]),
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

  it('enqueues a voice-profile refresh per user', async () => {
    const h = harness()
    const count = await enqueueVoiceProfiles(h.deps)
    expect(count).toBe(2)
    expect(h.enqueued.every((e) => e.queue === QUEUE.voiceProfile)).toBe(true)
    expect(h.enqueued.map((e) => e.payload)).toEqual([{ userId: 'u1' }, { userId: 'u2' }])
  })

  it('enqueues an agent_run per enabled scheduled agent', async () => {
    const h = harness()
    const count = await enqueueScheduledAgentRuns(h.deps)
    expect(count).toBe(2)
    expect(h.enqueued.every((e) => e.queue === QUEUE.agentRun)).toBe(true)
    expect(h.enqueued.map((e) => e.payload)).toEqual([
      { userId: 'u1', agentId: 'ag1' },
      { userId: 'u2', agentId: 'ag2' },
    ])
  })
})

/** A fake CronScheduler that records registrations and exposes the tick fns. */
function fakeCron(): {
  scheduleFn: CronScheduler
  registered: { expr: string; task: () => void }[]
  stops: { count: number }
} {
  const registered: { expr: string; task: () => void }[] = []
  const stops = { count: 0 }
  const scheduleFn: CronScheduler = (expr, task) => {
    registered.push({ expr, task })
    return {
      stop: () => {
        stops.count += 1
      },
    }
  }
  return { scheduleFn, registered, stops }
}

describe('CRON_EXPRESSIONS', () => {
  it('pins the documented cadences', () => {
    expect(CRON_EXPRESSIONS.gmailWatch).toBe('0 3 * * *')
    expect(CRON_EXPRESSIONS.outlookWatch).toBe('0 4 */2 * *')
    expect(CRON_EXPRESSIONS.reconcile).toBe('*/30 * * * *')
    expect(CRON_EXPRESSIONS.digest).toBe('0 7 * * *')
    expect(CRON_EXPRESSIONS.voiceProfile).toBe('0 5 * * 1')
    expect(CRON_EXPRESSIONS.agentSweep).toBe('0 * * * *')
  })
})

describe('startScheduler', () => {
  it('registers all six periodic tasks on their cron expressions', () => {
    const h = harness()
    const cron = fakeCron()
    startScheduler(h.deps, cron.scheduleFn)
    expect(cron.registered.map((r) => r.expr)).toEqual([
      CRON_EXPRESSIONS.gmailWatch,
      CRON_EXPRESSIONS.outlookWatch,
      CRON_EXPRESSIONS.reconcile,
      CRON_EXPRESSIONS.digest,
      CRON_EXPRESSIONS.voiceProfile,
      CRON_EXPRESSIONS.agentSweep,
    ])
  })

  it('firing the reconcile tick enqueues the sweep (cron only enqueues, never runs inline)', async () => {
    const h = harness()
    const cron = fakeCron()
    startScheduler(h.deps, cron.scheduleFn)
    const reconcile = cron.registered.find((r) => r.expr === CRON_EXPRESSIONS.reconcile)!
    reconcile.task()
    // The enqueue is fire-and-forget; wait for the async chain to settle.
    await vi.waitFor(() => expect(h.enqueued).toHaveLength(3))
    expect(h.enqueued.every((e) => e.queue === QUEUE.reconcile)).toBe(true)
  })

  it('stop() stops every registered task', () => {
    const h = harness()
    const cron = fakeCron()
    const handle = startScheduler(h.deps, cron.scheduleFn)
    handle.stop()
    expect(cron.stops.count).toBe(6)
  })

  it('logs (does not throw) when an enqueue tick rejects', async () => {
    const errors: string[] = []
    const logger: Logger = { info: () => {}, error: (msg) => errors.push(msg) }
    const deps: SchedulerDeps = {
      jobs: { enqueue: () => Promise.reject(new Error('db down')) },
      schedule: {
        listAccounts: () => Promise.resolve([{ id: 'a1', provider: 'gmail' }]),
        listUserIds: () => Promise.resolve([]),
        listScheduledAgents: () => Promise.resolve([]),
      },
      logger,
    }
    const cron = fakeCron()
    startScheduler(deps, cron.scheduleFn)
    const gmail = cron.registered.find((r) => r.expr === CRON_EXPRESSIONS.gmailWatch)!
    expect(() => gmail.task()).not.toThrow()
    await vi.waitFor(() => expect(errors.some((e) => e.includes('gmail watch renewal'))).toBe(true))
  })
})
