/**
 * Webhook edge tests: the Microsoft Graph subscription-handshake echo and the
 * Gmail OIDC rejection path. No DB is touched — the handshake returns early, and
 * the Gmail path rejects before any enqueue.
 */
import { describe, expect, it } from 'vitest'
import { webhooksRouter } from './webhooks'

describe('POST /webhooks/graph', () => {
  it('echoes the validationToken verbatim as text/plain (subscription handshake)', async () => {
    const res = await webhooksRouter.request('/graph?validationToken=abc%20123', {
      method: 'POST',
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')
    expect(await res.text()).toBe('abc 123')
  })
})

describe('POST /webhooks/gmail', () => {
  it('rejects a request with no bearer token (401)', async () => {
    const res = await webhooksRouter.request('/gmail', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: { data: '' } }),
    })
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'missing_token' })
  })

  it('rejects a malformed bearer token (401)', async () => {
    const res = await webhooksRouter.request('/gmail', {
      method: 'POST',
      headers: { authorization: 'Bearer not-a-jwt', 'content-type': 'application/json' },
      body: JSON.stringify({ message: { data: '' } }),
    })
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'invalid_token' })
  })
})
