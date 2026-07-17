import { describe, expect, it } from 'vitest'
import { makeWorkerDb, type Sql, type Tx } from './client'

/** A recorded tagged-template call inside a transaction. */
interface SqlCall {
  text: string
  values: unknown[]
}

/**
 * A fake postgres-js `Sql` whose `begin` runs the callback against a recording
 * transaction tag. This lets us assert the GUC/role statements `withUser` issues
 * without a real database. `begin` boxes the callback's result exactly as
 * postgres-js does (the driver unwraps arrays, which `makeWorkerDb` guards).
 */
function fakeSql(): { sql: Sql; calls: SqlCall[] } {
  const calls: SqlCall[] = []
  const tx = (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> => {
    calls.push({ text: strings.join('?').replace(/\s+/g, ' ').trim(), values })
    return Promise.resolve([])
  }
  const begin = <T>(fn: (t: Tx) => Promise<T>): Promise<T> => fn(tx as unknown as Tx)
  const end = (): Promise<void> => Promise.resolve()
  const sql = Object.assign(tx, { begin, end }) as unknown as Sql
  return { sql, calls }
}

const USER_ID = '11111111-2222-4333-8444-555555555555'

describe('makeWorkerDb.withUser', () => {
  it('opens a transaction and sets the app_user role + app.user_id GUC before fn', async () => {
    const { sql, calls } = fakeSql()
    const db = makeWorkerDb(sql)
    const result = await db.withUser(USER_ID, async () => 'scoped')

    expect(result).toBe('scoped')
    expect(calls).toHaveLength(2)
    expect(calls[0]?.text).toBe('set local role app_user')
    expect(calls[1]?.text).toContain("set_config('app.user_id'")
    // The user id is bound as a parameter, never interpolated into the SQL text.
    expect(calls[1]?.values).toEqual([USER_ID])
    expect(calls[1]?.text).not.toContain(USER_ID)
  })

  it('rejects a non-uuid userId without opening a transaction', async () => {
    const { sql, calls } = fakeSql()
    const db = makeWorkerDb(sql)
    await expect(db.withUser('not-a-uuid', async () => 'x')).rejects.toThrow(/UUID/)
    expect(calls).toHaveLength(0)
  })

  it('returns an array result intact (postgres-js array-unwrap guard)', async () => {
    const { sql } = fakeSql()
    const db = makeWorkerDb(sql)
    const rows = await db.withUser(USER_ID, async () => [{ id: 'a' }, { id: 'b' }])
    expect(rows).toEqual([{ id: 'a' }, { id: 'b' }])
  })
})

describe('makeWorkerDb.asService', () => {
  it('runs fn as the connection role — no SET ROLE / GUC statements', async () => {
    const { sql, calls } = fakeSql()
    const db = makeWorkerDb(sql)
    const result = await db.asService(async () => 42)
    expect(result).toBe(42)
    expect(calls).toHaveLength(0)
  })

  it('preserves an array result through the boxing', async () => {
    const { sql } = fakeSql()
    const db = makeWorkerDb(sql)
    expect(await db.asService(async () => ['x', 'y'])).toEqual(['x', 'y'])
  })
})
