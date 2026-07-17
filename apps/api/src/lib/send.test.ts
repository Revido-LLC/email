/**
 * `cancelSend` — the 10s-undo race guard.
 *
 * `@revido/db/client` is mocked so no live DB is touched: `asService` runs the job
 * delete (its `.returning()` resolves to a scripted row set — non-empty = the job
 * was still unclaimed and got withdrawn), and `withUser` runs the message delete.
 * The real `locked_at IS NULL` guard lives in the SQL; here we drive the two
 * outcomes by whether the job delete returns a row.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  /** Rows the job-delete `.returning()` resolves to ([] = worker already claimed it). */
  jobsRows: [] as unknown[],
  /** Every table a `.delete(...)` was issued against, in order. */
  deletedTables: [] as unknown[],
  /** How many times the user-scoped (message delete) path ran. */
  withUserCalls: 0,
}))

vi.mock('@revido/db/client', () => {
  class FakeQuery {
    private table: unknown
    constructor(
      private readonly rows: unknown[],
      private readonly onDelete: (table: unknown) => void,
    ) {}
    delete(table: unknown): this {
      this.table = table
      this.onDelete(table)
      return this
    }
    where(): this {
      return this
    }
    returning(): this {
      return this
    }
    then(onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown): unknown {
      return Promise.resolve(this.rows).then(onFulfilled, onRejected)
    }
  }
  return {
    asService: (fn: (tx: unknown) => unknown) =>
      fn(new FakeQuery(h.jobsRows, (t) => h.deletedTables.push(t))),
    withUser: (_userId: string, fn: (tx: unknown) => unknown) => {
      h.withUserCalls += 1
      return fn(new FakeQuery([], (t) => h.deletedTables.push(t)))
    },
  }
})

const { cancelSend } = await import('./send')
const { jobs, messages } = await import('@revido/db/schema')

const USER_ID = '11111111-2222-4333-8444-555555555555'
const MESSAGE_ID = 'msg-1'

beforeEach(() => {
  h.jobsRows = []
  h.deletedTables = []
  h.withUserCalls = 0
})

describe('cancelSend', () => {
  it('withdraws an unclaimed pending send and drops the local message', async () => {
    h.jobsRows = [{ id: 'job-1' }] // the delete matched a still-unclaimed row
    const cancelled = await cancelSend(USER_ID, MESSAGE_ID)

    expect(cancelled).toBe(true)
    expect(h.deletedTables).toContain(jobs)
    expect(h.deletedTables).toContain(messages) // never-sent copy removed
    expect(h.withUserCalls).toBe(1)
  })

  it('loses the race once the worker has claimed the job: reports not-cancelled and keeps the message', async () => {
    h.jobsRows = [] // locked_at IS NULL matched nothing — the send is in flight
    const cancelled = await cancelSend(USER_ID, MESSAGE_ID)

    expect(cancelled).toBe(false)
    // The outbound message must NOT be deleted — the worker still marks it sent.
    expect(h.deletedTables).not.toContain(messages)
    expect(h.withUserCalls).toBe(0)
  })
})
