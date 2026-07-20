import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { apiCors } from './cors'

function makeApp() {
  const app = new Hono()
  app.use(
    '*',
    apiCors({
      WEB_ORIGIN: 'https://email.revido.co',
    } as NodeJS.ProcessEnv),
  )
  app.get('/session', (c) => c.json({ ok: true }))
  return app
}

describe('apiCors', () => {
  it('allows credentialed requests from the configured Web origin', async () => {
    const res = await makeApp().request('/session', {
      headers: { origin: 'https://email.revido.co' },
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://email.revido.co')
    expect(res.headers.get('access-control-allow-credentials')).toBe('true')
  })

  it('answers an allowed preflight with the required methods and headers', async () => {
    const res = await makeApp().request('/session', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://email.revido.co',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    })

    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://email.revido.co')
    expect(res.headers.get('access-control-allow-methods')).toContain('POST')
    expect(res.headers.get('access-control-allow-headers')).toContain('Content-Type')
  })

  it('does not grant cross-origin access to an untrusted site', async () => {
    const res = await makeApp().request('/session', {
      headers: { origin: 'https://attacker.example' },
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(res.headers.get('access-control-allow-credentials')).toBeNull()
  })
})
