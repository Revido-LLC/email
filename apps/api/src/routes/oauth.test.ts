/**
 * CSRF binding for the additional-mailbox OAuth flow.
 *
 * `/start` sets a per-flow nonce cookie whose value is also inside the signed
 * state; `/callback` is `requireUser`-gated and requires (a) the session user to
 * equal the state's user and (b) the nonce cookie to match the state — so a forged
 * callback can't attach a mailbox to another account. Every assertion here trips a
 * guard BEFORE the token exchange, so no provider network mocking is needed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ session: { value: null as null | { user: { id: string } } } }))

vi.mock('../auth', () => ({
  auth: { api: { getSession: vi.fn(async () => h.session.value) } },
}))
vi.mock('../lib/mailbox-link', () => ({ linkMailbox: vi.fn(async () => {}) }))

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'

let oauthRouter: typeof import('./oauth').oauthRouter

beforeEach(async () => {
  vi.resetModules()
  process.env.BETTER_AUTH_SECRET = 'test-secret'
  process.env.BETTER_AUTH_URL = 'https://api.example.test'
  process.env.GOOGLE_CLIENT_ID = 'gid'
  process.env.GOOGLE_CLIENT_SECRET = 'gsecret'
  h.session.value = null
  ;({ oauthRouter } = await import('./oauth'))
})

/** Drive /start as USER_A and return its signed state + nonce cookie value. */
async function startFlow(): Promise<{ state: string; nonce: string; setCookie: string }> {
  h.session.value = { user: { id: USER_A } }
  const res = await oauthRouter.request('/gmail/start', { method: 'POST' })
  expect(res.status).toBe(200)
  const { redirectUrl } = (await res.json()) as { redirectUrl: string }
  const state = new URL(redirectUrl).searchParams.get('state')!
  const setCookie = res.headers.get('set-cookie') ?? ''
  const nonce = /rm_oauth_nonce=([^;]+)/.exec(setCookie)![1]!
  return { state, nonce, setCookie }
}

describe('oauth mailbox-link CSRF binding', () => {
  it('/start sets an httpOnly, SameSite=Lax nonce cookie', async () => {
    const { setCookie, nonce } = await startFlow()
    expect(nonce).toBeTruthy()
    expect(setCookie.toLowerCase()).toContain('httponly')
    expect(setCookie.toLowerCase()).toContain('samesite=lax')
    expect(setCookie).toContain('Path=/auth/oauth')
  })

  it('rejects the callback with no session (requireUser)', async () => {
    const { state, nonce } = await startFlow()
    h.session.value = null
    const res = await oauthRouter.request(`/gmail/callback?code=x&state=${state}`, {
      headers: { cookie: `rm_oauth_nonce=${nonce}` },
    })
    expect(res.status).toBe(401)
  })

  it('rejects when the session user differs from the state user', async () => {
    const { state, nonce } = await startFlow()
    h.session.value = { user: { id: USER_B } }
    const res = await oauthRouter.request(`/gmail/callback?code=x&state=${state}`, {
      headers: { cookie: `rm_oauth_nonce=${nonce}` },
    })
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('state_session_mismatch')
  })

  it('rejects when the nonce cookie is missing', async () => {
    const { state } = await startFlow()
    h.session.value = { user: { id: USER_A } }
    const res = await oauthRouter.request(`/gmail/callback?code=x&state=${state}`)
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('oauth_state_mismatch')
  })

  it('rejects when the nonce cookie does not match the signed state', async () => {
    const { state } = await startFlow()
    h.session.value = { user: { id: USER_A } }
    const res = await oauthRouter.request(`/gmail/callback?code=x&state=${state}`, {
      headers: { cookie: 'rm_oauth_nonce=not-the-real-nonce' },
    })
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('oauth_state_mismatch')
  })
})
