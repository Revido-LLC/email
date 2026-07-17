import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import { asService, assertServiceRoleBypassesRls, type Database, withUser } from './client'

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

/** A fake db whose service transaction resolves `tx.execute` to a scripted probe row. */
function probeDb(rows: unknown[]) {
  const tx = { execute: vi.fn(async () => rows) }
  const db = {
    transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  } as unknown as Database
  return db
}

describe('assertServiceRoleBypassesRls', () => {
  it('is satisfied by a superuser role and does not warn', async () => {
    const warn = vi.fn()
    const result = await assertServiceRoleBypassesRls(
      probeDb([{ role: 'postgres', is_superuser: true, bypass_rls: false }]),
      { warn },
    )
    expect(result.bypasses).toBe(true)
    expect(warn).not.toHaveBeenCalled()
  })

  it('is satisfied by a BYPASSRLS role and does not warn', async () => {
    const warn = vi.fn()
    const result = await assertServiceRoleBypassesRls(
      probeDb([{ role: 'svc', is_superuser: false, bypass_rls: true }]),
      { warn },
    )
    expect(result.bypasses).toBe(true)
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns loudly when the role is neither superuser nor BYPASSRLS', async () => {
    const warn = vi.fn()
    const result = await assertServiceRoleBypassesRls(
      probeDb([{ role: 'least_priv', is_superuser: false, bypass_rls: false }]),
      { warn },
    )
    expect(result.bypasses).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('BYPASSRLS')
  })

  it('never throws on a probe error (reports optimistically, logs)', async () => {
    const warn = vi.fn()
    const db = {
      transaction: vi.fn(async () => {
        throw new Error('connection reset')
      }),
    } as unknown as Database
    const result = await assertServiceRoleBypassesRls(db, { warn })
    expect(result.bypasses).toBe(true)
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
