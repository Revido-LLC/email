import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import { asService, type Database, withUser } from './client'

const dialect = new PgDialect()

/** A fake Drizzle db whose `transaction` records every `tx.execute(sql)` call. */
function fakeDb() {
  const executed: unknown[] = []
  const tx = {
    execute: vi.fn(async (query: unknown) => {
      executed.push(query)
      return []
    }),
  }
  const db = {
    transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  } as unknown as Database
  return { db, tx, executed }
}

const USER_ID = '11111111-2222-4333-8444-555555555555'

describe('withUser', () => {
  it('opens a transaction and sets role + app.user_id before running fn', async () => {
    const { db, executed } = fakeDb()
    const result = await withUser(USER_ID, async () => 'scoped', db)

    expect(result).toBe('scoped')
    expect(executed).toHaveLength(2)

    const setRole = dialect.sqlToQuery(executed[0] as never)
    expect(setRole.sql).toBe('set local role app_user')
    expect(setRole.params).toEqual([])

    const setUser = dialect.sqlToQuery(executed[1] as never)
    expect(setUser.sql).toBe("select set_config('app.user_id', $1, true)")
    expect(setUser.params).toEqual([USER_ID])
  })

  it('binds the user id as a parameter (never interpolated into SQL)', async () => {
    const { db, executed } = fakeDb()
    await withUser(USER_ID, async () => undefined, db)
    const setUser = dialect.sqlToQuery(executed[1] as never)
    expect(setUser.sql).not.toContain(USER_ID)
  })

  it('rejects a non-uuid userId without opening a transaction', async () => {
    const { db } = fakeDb()
    await expect(withUser('not-a-uuid', async () => 'x', db)).rejects.toThrow(/UUID/)
    expect(db.transaction).not.toHaveBeenCalled()
  })
})

describe('asService', () => {
  it('runs fn in a transaction as the connection role (no SET ROLE)', async () => {
    const { db, tx, executed } = fakeDb()
    const result = await asService(async (t) => {
      expect(t).toBe(tx)
      return 42
    }, db)

    expect(result).toBe(42)
    expect(db.transaction).toHaveBeenCalledTimes(1)
    // No role/GUC statements are issued for the service path.
    expect(executed).toHaveLength(0)
  })
})
