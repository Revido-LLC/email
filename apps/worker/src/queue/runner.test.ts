import { describe, expect, it, vi } from 'vitest'
import {
  defaultBackoffMs,
  processNextJob,
  type ConsumerRegistry,
  type RunnerOptions,
} from './runner'
import type { ClaimedJob, JobFailure, JobStore } from './store'

/** In-memory JobStore for testing the runner's claim/settle logic. */
class FakeJobStore implements JobStore {
  completed: string[] = []
  failures: (JobFailure & { jobId: string })[] = []
  enqueued: { queue: string; payload: unknown; runAt?: Date }[] = []
  private queueRows: ClaimedJob[]

  constructor(rows: ClaimedJob[] = []) {
    this.queueRows = rows
  }

  async claim(): Promise<ClaimedJob | null> {
    return this.queueRows.shift() ?? null
  }
  async complete(jobId: string): Promise<void> {
    this.completed.push(jobId)
  }
  async fail(jobId: string, failure: JobFailure): Promise<void> {
    this.failures.push({ jobId, ...failure })
  }
  async enqueue(queue: string, payload: unknown, opts?: { runAt?: Date }): Promise<void> {
    this.enqueued.push({ queue, payload, runAt: opts?.runAt })
  }
}

const NOW = new Date('2026-07-17T00:00:00Z')
const opts: RunnerOptions = { workerId: 'w1', pollIntervalMs: 10, now: () => NOW }

function job(overrides: Partial<ClaimedJob> = {}): ClaimedJob {
  return { id: 'j1', queue: 'triage', payload: { x: 1 }, attempts: 0, maxAttempts: 5, ...overrides }
}

describe('processNextJob', () => {
  it('returns false when the queue is empty', async () => {
    const store = new FakeJobStore([])
    expect(await processNextJob(store, {}, opts)).toBe(false)
  })

  it('dispatches to the queue consumer and marks the job done', async () => {
    const store = new FakeJobStore([job()])
    const consumer = vi.fn().mockResolvedValue(undefined)
    const registry: ConsumerRegistry = { triage: consumer }

    expect(await processNextJob(store, registry, opts)).toBe(true)
    expect(consumer).toHaveBeenCalledWith({ x: 1 }, expect.objectContaining({ id: 'j1' }))
    expect(store.completed).toEqual(['j1'])
    expect(store.failures).toHaveLength(0)
  })

  it('retries with exponential backoff on failure below the cap', async () => {
    const store = new FakeJobStore([job({ attempts: 1 })])
    const registry: ConsumerRegistry = {
      triage: () => Promise.reject(new Error('boom')),
    }
    await processNextJob(store, registry, opts)

    expect(store.completed).toHaveLength(0)
    const failure = store.failures[0]
    expect(failure?.attempts).toBe(2)
    expect(failure?.error).toContain('boom')
    // attempts-so-far after increment = 2 ⇒ backoff 5s * 2^(2-1) = 10s.
    expect(failure?.runAt.getTime()).toBe(NOW.getTime() + 10_000)
  })

  it('dead-letters immediately when no consumer is registered', async () => {
    const store = new FakeJobStore([job({ queue: 'unknown', maxAttempts: 5 })])
    await processNextJob(store, {}, opts)
    const failure = store.failures[0]
    expect(failure?.attempts).toBe(5)
    expect(failure?.maxAttempts).toBe(5)
    expect(failure?.error).toContain('no consumer')
  })
})

describe('defaultBackoffMs', () => {
  it('grows exponentially from 5s and caps at 1h', () => {
    expect(defaultBackoffMs(1)).toBe(5_000)
    expect(defaultBackoffMs(2)).toBe(10_000)
    expect(defaultBackoffMs(3)).toBe(20_000)
    expect(defaultBackoffMs(100)).toBe(60 * 60_000)
  })
})
