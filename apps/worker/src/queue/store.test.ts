import { describe, expect, it } from 'vitest'
import type { Tx, WorkerDb } from '../db/client'
import { PgJobStore } from './store'

/** A recorded tagged-template SQL call: the joined text and the bound values. */
interface SqlCall {
  text: string
  values: unknown[]
}

/**
 * A fake {@link WorkerDb} whose `asService`/`withUser` run the callback against a
 * recording tagged-template `sql`. Each store method issues exactly one query, so
 * we return a single canned row set and capture the bound parameters.
 */
function fakeDb(rows: unknown[] = []): { db: WorkerDb; calls: SqlCall[] } {
  const calls: SqlCall[] = []
  const tag = (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> => {
    calls.push({ text: strings.join('?').replace(/\s+/g, ' ').trim(), values })
    return Promise.resolve(rows)
  }
  ;(tag as unknown as { json: (v: unknown) => unknown }).json = (v) => ({ __json: v })
  const sql = tag as unknown as Tx
  const db: WorkerDb = {
    sql: sql as unknown as WorkerDb['sql'],
    asService: (fn) => fn(sql),
    withUser: (_userId, fn) => fn(sql),
    close: () => Promise.resolve(),
  }
  return { db, calls }
}

const NOW = new Date('2026-07-17T00:00:00Z')

describe('PgJobStore.claim', () => {
  it('claims the oldest due row for the worker and maps it to a ClaimedJob', async () => {
    const { db, calls } = fakeDb([
      { id: 'j1', queue: 'triage', payload: { x: 1 }, attempts: 2, max_attempts: 5 },
    ])
    const store = new PgJobStore(db, { now: () => NOW, lockTtlMs: 60_000 })
    const job = await store.claim('worker-a')

    expect(job).toEqual({ id: 'j1', queue: 'triage', payload: { x: 1 }, attempts: 2, maxAttempts: 5 })
    // Binds the worker id and the stale-lock reclaim boundary (now - lockTtl).
    expect(calls[0]?.values[0]).toBe('worker-a')
    expect(calls[0]?.values[1]).toBe(new Date(NOW.getTime() - 60_000).toISOString())
    expect(calls[0]?.text).toContain('for update skip locked')
    // Attempts is burned at claim time so a crashed job can't retry forever.
    expect(calls[0]?.text).toContain('attempts = attempts + 1')
  })

  it('returns null when no row is available', async () => {
    const { db } = fakeDb([])
    const store = new PgJobStore(db, { now: () => NOW })
    expect(await store.claim('worker-a')).toBeNull()
  })
})

describe('PgJobStore.complete', () => {
  it("marks the job done and clears the lock", async () => {
    const { db, calls } = fakeDb([])
    await new PgJobStore(db).complete('j9')
    expect(calls[0]?.text).toContain("status = 'done'")
    expect(calls[0]?.values).toEqual(['j9'])
  })
})

describe('PgJobStore.fail', () => {
  it('retries (status pending) while below the attempt cap', async () => {
    const { db, calls } = fakeDb([])
    const runAt = new Date(NOW.getTime() + 10_000)
    await new PgJobStore(db).fail('j1', {
      attempts: 2,
      maxAttempts: 5,
      error: 'boom',
      runAt,
    })
    // values order: [status, attempts, error, runAt, jobId]
    expect(calls[0]?.values).toEqual(['pending', 2, 'boom', runAt.toISOString(), 'j1'])
  })

  it('dead-letters (status failed) once attempts reach maxAttempts', async () => {
    const { db, calls } = fakeDb([])
    await new PgJobStore(db).fail('j1', {
      attempts: 5,
      maxAttempts: 5,
      error: 'gave up',
      runAt: NOW,
    })
    expect(calls[0]?.values[0]).toBe('failed')
  })
})

describe('PgJobStore.enqueue', () => {
  it('defaults run_at to now() and json-wraps the payload', async () => {
    const { db, calls } = fakeDb([])
    const store = new PgJobStore(db, { now: () => NOW })
    await store.enqueue('triage', { messageId: 'm1' })
    // values order: [queue, json(payload), runAt]
    expect(calls[0]?.values[0]).toBe('triage')
    expect(calls[0]?.values[1]).toEqual({ __json: { messageId: 'm1' } })
    expect(calls[0]?.values[2]).toBe(NOW.toISOString())
  })

  it('honors an explicit runAt (deferred send)', async () => {
    const { db, calls } = fakeDb([])
    const runAt = new Date(NOW.getTime() + 10_000)
    await new PgJobStore(db, { now: () => NOW }).enqueue('send', { id: 's' }, { runAt })
    expect(calls[0]?.values[2]).toBe(runAt.toISOString())
  })
})
