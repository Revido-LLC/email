/**
 * Webhook edge tests: the Microsoft Graph subscription-handshake echo, the Gmail
 * OIDC rejection path, and the production fail-CLOSED guard for missing verification
 * secrets. No DB is touched — the handshake returns early, and the reject paths bail
 * before any enqueue.
 */
import { afterEach, describe, expect, it } from 'vitest'
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

describe('webhook verification fails CLOSED in production', () => {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    GMAIL_PUSH_AUDIENCE: process.env.GMAIL_PUSH_AUDIENCE,
    GMAIL_PUSH_SA_EMAIL: process.env.GMAIL_PUSH_SA_EMAIL,
    GRAPH_CLIENT_STATE: process.env.GRAPH_CLIENT_STATE,
  }

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('refuses the Gmail push (500) when GMAIL_PUSH_AUDIENCE is unset in production', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.GMAIL_PUSH_AUDIENCE
    process.env.GMAIL_PUSH_SA_EMAIL = 'push@example.iam.gserviceaccount.com'

    const res = await webhooksRouter.request('/gmail', {
      method: 'POST',
      headers: { authorization: 'Bearer x.y.z', 'content-type': 'application/json' },
      body: JSON.stringify({ message: { data: '' } }),
    })
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ error: 'webhook_misconfigured' })
  })

  it('refuses the Graph notification (500) when GRAPH_CLIENT_STATE is unset in production', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.GRAPH_CLIENT_STATE

    const res = await webhooksRouter.request('/graph', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: [{ subscriptionId: 's1', resource: 'r', clientState: 'x' }] }),
    })
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ error: 'webhook_misconfigured' })
  })
})
