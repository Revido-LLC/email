/**
 * Route tests for `GET /image-proxy`: the session gate, the required `url`, and a
 * happy-path fetch. `../auth`, `node:dns/promises`, and the global `fetch` are
 * mocked so no real network / session is needed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'

const h = vi.hoisted(() => ({ session: { value: null as null | { user: { id: string } } } }))

vi.mock('../auth', () => ({
  auth: { api: { getSession: vi.fn(async () => h.session.value) } },
}))
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }))

const { lookup } = await import('node:dns/promises')
const lookupMock = lookup as unknown as Mock
const { imageProxyRouter } = await import('./image-proxy')

beforeEach(() => {
  h.session.value = { user: { id: '11111111-1111-4111-8111-111111111111' } }
  lookupMock.mockReset()
  lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GET /image-proxy', () => {
  it('401s without a session', async () => {
    h.session.value = null
    const res = await imageProxyRouter.request('/?url=https://cdn.example.com/a.png')
    expect(res.status).toBe(401)
  })

  it('400s without a url', async () => {
    const res = await imageProxyRouter.request('/')
    expect(res.status).toBe(400)
  })

  it('re-serves a validated image', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
      ),
    )
    const res = await imageProxyRouter.request('/?url=https://cdn.example.com/a.png')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toContain('private')
    const buf = new Uint8Array(await res.arrayBuffer())
    expect(buf).toEqual(new Uint8Array([1, 2, 3, 4]))
  })

  it('403s when the url resolves to a private address', async () => {
    lookupMock.mockResolvedValue([{ address: '10.0.0.1', family: 4 }])
    const res = await imageProxyRouter.request('/?url=https://internal.example.com/a.png')
    expect(res.status).toBe(403)
  })
})
