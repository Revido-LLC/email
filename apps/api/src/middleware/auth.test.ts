import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the whole auth module so betterAuth()/getDb() never run (no DATABASE_URL).
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('../auth', () => ({ auth: { api: { getSession } } }))

import { requireUser, type Variables } from './auth'

function makeApp() {
  const app = new Hono<{ Variables: Variables }>()
  app.use('/me', requireUser)
  app.get('/me', (c) => c.json({ userId: c.get('userId') }))
  return app
}

beforeEach(() => {
  getSession.mockReset()
})

describe('requireUser', () => {
  it('401s with an error body when there is no session', async () => {
    getSession.mockResolvedValue(null)
    const res = await makeApp().request('/me')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it('sets userId and continues when Better Auth returns a session', async () => {
    getSession.mockResolvedValue({ user: { id: 'user-123' }, session: { id: 's1' } })
    const res = await makeApp().request('/me')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ userId: 'user-123' })
  })

  it('forwards the request headers to getSession', async () => {
    getSession.mockResolvedValue({ user: { id: 'u' }, session: {} })
    await makeApp().request('/me', { headers: { authorization: 'Bearer token' } })
    expect(getSession).toHaveBeenCalledTimes(1)
    const arg = getSession.mock.calls.at(0)?.[0] as { headers: Headers }
    expect(arg.headers.get('authorization')).toBe('Bearer token')
  })
})
