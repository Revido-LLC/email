import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { describe, expect, it } from 'vitest'
import { securityHeaders } from './security-headers'

function makeApp(opts?: Parameters<typeof securityHeaders>[0]) {
  const app = new Hono()
  app.use('*', securityHeaders(opts))
  app.get('/json', (c) => c.json({ ok: true }))
  app.get('/stream', (c) =>
    streamSSE(c, async (stream) => {
      await stream.writeSSE({ event: 'token', data: 'hi' })
    }),
  )
  return app
}

describe('securityHeaders', () => {
  it('sets the strict header set on a JSON response', async () => {
    const res = await makeApp().request('/json')
    expect(res.headers.get('content-security-policy')).toBe(
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    )
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin')
    expect(res.headers.get('strict-transport-security')).toBe('max-age=15552000; includeSubDomains')
    expect(res.headers.get('permissions-policy')).toContain('camera=()')
  })

  it('attaches headers to streaming (SSE) responses too', async () => {
    const res = await makeApp().request('/stream')
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('omits HSTS when disabled and honors a custom CSP', async () => {
    const res = await makeApp({ hsts: false, csp: "default-src 'self'" }).request('/json')
    expect(res.headers.get('strict-transport-security')).toBeNull()
    expect(res.headers.get('content-security-policy')).toBe("default-src 'self'")
  })
})
