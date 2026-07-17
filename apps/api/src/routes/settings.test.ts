/**
 * Route tests for `/settings`.
 *
 * - Appearance (`users.theme`): GET returns the stored theme (null when unset),
 *   PATCH validates the enum and echoes the saved value, and both 401 without a
 *   session.
 * - AI toggles (`usage_counters`): GET defaults every switch to on, PATCH persists
 *   a subset and returns the merged state.
 *
 * `@revido/db/client` is mocked with a chainable fake transaction backed by
 * in-memory rows; the Better Auth session is mocked per test.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '11111111-1111-4111-8111-111111111111'

interface AiRow {
  metric: string
  count: number
}

const h = vi.hoisted(() => ({
  usersRow: { theme: null as string | null },
  aiRows: [] as AiRow[],
  updates: [] as { table: unknown; set: Record<string, unknown> }[],
  tables: null as null | { users: unknown; usageCounters: unknown },
  session: { value: null as null | { user: { id: string } } },
}))

vi.mock('../auth', () => ({
  auth: { api: { getSession: vi.fn(async () => h.session.value) } },
}))

function makeTx() {
  return {
    select: (_cols: unknown) => ({
      from: (table: unknown) => ({
        where: (_w: unknown) =>
          Promise.resolve(table === h.tables?.users ? [{ theme: h.usersRow.theme }] : h.aiRows),
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: (_cfg: unknown) => {
          if (table === h.tables?.usageCounters) {
            const metric = values.metric as string
            const count = values.count as number
            const existing = h.aiRows.find((r) => r.metric === metric)
            if (existing) existing.count = count
            else h.aiRows.push({ metric, count })
          }
          return Promise.resolve()
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: (_w: unknown) => {
          h.updates.push({ table, set })
          if (table === h.tables?.users) h.usersRow.theme = set.theme as string | null
          return Promise.resolve()
        },
      }),
    }),
  }
}

vi.mock('@revido/db/client', () => ({
  withUser: (_userId: string, fn: (tx: unknown) => unknown) => fn(makeTx()),
}))

const { users, usageCounters } = await import('@revido/db/schema')
h.tables = { users, usageCounters }
const { settingsRouter } = await import('./settings')

beforeEach(() => {
  h.usersRow = { theme: null }
  h.aiRows = []
  h.updates = []
  h.session.value = { user: { id: USER_ID } }
})

async function req(path: string, init?: RequestInit): Promise<Response> {
  return settingsRouter.request(path, init)
}

async function patch(path: string, body: unknown): Promise<Response> {
  return req(path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /settings/appearance', () => {
  it('returns null when the user has no stored theme', async () => {
    const res = await req('/appearance')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ theme: null })
  })

  it('returns the stored theme', async () => {
    h.usersRow.theme = 'dark'
    const res = await req('/appearance')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ theme: 'dark' })
  })

  it('coerces an unknown stored value to null', async () => {
    h.usersRow.theme = 'sepia'
    const res = await req('/appearance')
    expect(await res.json()).toEqual({ theme: null })
  })

  it('401s without a session', async () => {
    h.session.value = null
    const res = await req('/appearance')
    expect(res.status).toBe(401)
  })
})

describe('PATCH /settings/appearance', () => {
  it('saves and echoes a valid theme', async () => {
    const res = await patch('/appearance', { theme: 'system' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ theme: 'system' })
    expect(h.updates).toHaveLength(1)
    expect(h.updates[0]?.set).toEqual({ theme: 'system' })
  })

  it('400s on an invalid theme', async () => {
    const res = await patch('/appearance', { theme: 'neon' })
    expect(res.status).toBe(400)
    expect(h.updates).toHaveLength(0)
  })

  it('400s on a missing theme', async () => {
    const res = await patch('/appearance', {})
    expect(res.status).toBe(400)
  })

  it('401s without a session', async () => {
    h.session.value = null
    const res = await patch('/appearance', { theme: 'light' })
    expect(res.status).toBe(401)
  })
})

describe('GET /settings/ai', () => {
  it('defaults every toggle to on for a fresh user', async () => {
    const res = await req('/ai')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ drafts: true, agents: true, chat: true, digest: true })
  })

  it('reflects a stored off toggle', async () => {
    h.aiRows = [{ metric: 'pref_chat', count: 0 }]
    const res = await req('/ai')
    expect(await res.json()).toMatchObject({ chat: false, drafts: true })
  })
})

describe('PATCH /settings/ai', () => {
  it('persists a subset and returns the merged state', async () => {
    const res = await patch('/ai', { digest: false })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ drafts: true, agents: true, chat: true, digest: false })
  })
})
