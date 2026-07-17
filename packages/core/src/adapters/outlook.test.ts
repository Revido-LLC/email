import { describe, expect, it } from 'vitest'
import { OutlookAdapter } from './outlook'
import { makeFakeFetch } from './__fixtures__/fake-fetch'
import messagesDelta from './__fixtures__/outlook/messages-delta.json'
import deltaIncremental from './__fixtures__/outlook/delta-incremental.json'
import subscription from './__fixtures__/outlook/subscription.json'

const creds = {
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
}

describe('OutlookAdapter.backfill', () => {
  it('parses a delta page and reports completion when only a deltaLink remains', async () => {
    const { fetchImpl } = makeFakeFetch([
      { when: (u) => u.includes('/me/messages/delta'), json: messagesDelta },
    ])
    const adapter = new OutlookAdapter({ fetchImpl, userEmail: 'jane@example.com' })
    const page = await adapter.backfill(creds)

    expect(page.messages).toHaveLength(2)
    // No nextLink on the fixture -> backfill is complete.
    expect(page.nextCursor).toBeNull()

    const m1 = page.messages[0]!
    const m2 = page.messages[1]!
    expect(m1.providerMessageId).toBe('AAMk-graph-1')
    expect(m1.providerThreadId).toBe('conv-1')
    expect(m1.from).toEqual({ name: 'Priya Shah', email: 'priya@studio.com' })
    expect(m1.html).toContain('design review')
    expect(m1.outbound).toBe(false)
    expect(m1.headers['message-id']).toBe('<graph-1@studio.com>')

    // Sent by the mailbox owner -> outbound; text/plain body flows to `text`.
    expect(m2.outbound).toBe(true)
    expect(m2.text).toBe('Thursday 3pm works for me.')
  })
})

describe('OutlookAdapter.incremental', () => {
  it('applies a delta: upserts changes, records @removed, advances the deltaLink', async () => {
    const { fetchImpl } = makeFakeFetch([
      { when: (u) => u.includes('/me/messages/delta'), json: deltaIncremental },
    ])
    const adapter = new OutlookAdapter({ fetchImpl, userEmail: 'jane@example.com' })
    const delta = await adapter.incremental(
      creds,
      'https://graph.microsoft.com/v1.0/me/messages/delta?$deltatoken=DELTA_TOKEN_1',
    )

    expect(delta.upserted).toHaveLength(1)
    expect(delta.upserted[0]?.providerMessageId).toBe('AAMk-graph-3')
    expect(delta.deletedProviderMessageIds).toEqual(['AAMk-graph-removed'])
    expect(delta.nextCursor).toContain('DELTA_TOKEN_2')
  })
})

describe('OutlookAdapter.send', () => {
  it('replies via createReply so Graph sets the threading headers', async () => {
    const { fetchImpl, calls } = makeFakeFetch([
      { when: (u) => u.includes('/createReply'), json: { id: 'draft-1' } },
      { when: (u) => u.includes('/messages/draft-1/send'), status: 202 },
      { when: (u) => u.includes('/messages/draft-1'), status: 200 },
    ])
    const adapter = new OutlookAdapter({ fetchImpl, userEmail: 'jane@example.com' })
    const res = await adapter.send(creds, {
      to: [{ name: 'Priya Shah', email: 'priya@studio.com' }],
      subject: 'RE: Design review Thursday',
      html: '<p>Thursday works.</p>',
      text: 'Thursday works.',
      inReplyToProviderMessageId: 'AAMk-graph-1',
    })

    expect(res.providerMessageId).toBe('draft-1')
    expect(calls.some((c) => c.url.includes('/messages/AAMk-graph-1/createReply'))).toBe(true)
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/draft-1/send'))).toBe(true)

    const patch = calls.find((c) => c.method === 'PATCH')
    expect(patch).toBeDefined()
    const patchBody = JSON.parse(patch!.body!) as { toRecipients: unknown[] }
    expect(patchBody.toRecipients).toHaveLength(1)
  })

  it('sends a fresh message via sendMail', async () => {
    const { fetchImpl, calls } = makeFakeFetch([
      { when: (u) => u.includes('/me/sendMail'), status: 202 },
    ])
    const adapter = new OutlookAdapter({ fetchImpl })
    await adapter.send(creds, {
      to: [{ name: 'Priya Shah', email: 'priya@studio.com' }],
      subject: 'Hello',
      html: '<p>Hi</p>',
      text: 'Hi',
    })
    const call = calls.find((c) => c.url.includes('/me/sendMail'))
    expect(call).toBeDefined()
    const body = JSON.parse(call!.body!) as { message: { subject: string } }
    expect(body.message.subject).toBe('Hello')
  })

  it('attaches a Graph fileAttachment to a fresh sendMail message', async () => {
    const { fetchImpl, calls } = makeFakeFetch([
      { when: (u) => u.includes('/me/sendMail'), status: 202 },
    ])
    const adapter = new OutlookAdapter({ fetchImpl })
    const content = Buffer.from('hello attachment')
    await adapter.send(creds, {
      to: [{ name: 'Priya Shah', email: 'priya@studio.com' }],
      subject: 'Here is the file',
      html: '<p>See attached.</p>',
      text: 'See attached.',
      attachments: [{ name: 'notes.txt', mime: 'text/plain', content }],
    })
    const call = calls.find((c) => c.url.includes('/me/sendMail'))
    const body = JSON.parse(call!.body!) as {
      message: {
        attachments?: { '@odata.type': string; name: string; contentType: string; contentBytes: string }[]
      }
    }
    const att = body.message.attachments?.[0]
    expect(att).toBeDefined()
    expect(att!['@odata.type']).toBe('#microsoft.graph.fileAttachment')
    expect(att!.name).toBe('notes.txt')
    expect(att!.contentType).toBe('text/plain')
    expect(Buffer.from(att!.contentBytes, 'base64').toString()).toBe('hello attachment')
  })

  it('POSTs attachments onto a reply draft before sending', async () => {
    const { fetchImpl, calls } = makeFakeFetch([
      { when: (u) => u.includes('/createReply'), json: { id: 'draft-1' } },
      { when: (u) => u.endsWith('/draft-1/attachments'), status: 201, json: { id: 'att-1' } },
      { when: (u) => u.includes('/messages/draft-1/send'), status: 202 },
      { when: (u) => u.includes('/messages/draft-1'), status: 200 },
    ])
    const adapter = new OutlookAdapter({ fetchImpl, userEmail: 'jane@example.com' })
    const content = Buffer.from('reply attachment')
    await adapter.send(creds, {
      to: [{ name: 'Priya Shah', email: 'priya@studio.com' }],
      subject: 'RE: Design review Thursday',
      html: '<p>Thursday works.</p>',
      text: 'Thursday works.',
      inReplyToProviderMessageId: 'AAMk-graph-1',
      attachments: [{ name: 'reply.txt', mime: 'text/plain', content }],
    })

    const attachCall = calls.find(
      (c) => c.method === 'POST' && c.url.endsWith('/draft-1/attachments'),
    )
    expect(attachCall).toBeDefined()
    const att = JSON.parse(attachCall!.body!) as { '@odata.type': string; contentBytes: string }
    expect(att['@odata.type']).toBe('#microsoft.graph.fileAttachment')
    expect(Buffer.from(att.contentBytes, 'base64').toString()).toBe('reply attachment')
    // The attachment is added before the draft is sent.
    const attachIdx = calls.findIndex((c) => c.url.endsWith('/draft-1/attachments'))
    const sendIdx = calls.findIndex((c) => c.url.endsWith('/draft-1/send'))
    expect(attachIdx).toBeGreaterThanOrEqual(0)
    expect(attachIdx).toBeLessThan(sendIdx)
  })
})

describe('OutlookAdapter.watch', () => {
  it('creates a change-notification subscription and seeds a deltaLink cursor', async () => {
    const { fetchImpl, calls } = makeFakeFetch([
      { when: (u) => u.includes('/subscriptions'), json: subscription },
      { when: (u) => u.includes('/me/messages/delta'), json: messagesDelta },
    ])
    const adapter = new OutlookAdapter({
      fetchImpl,
      notificationUrl: 'https://api.revido.example/webhooks/graph',
      clientState: 'opaque-secret',
    })
    const reg = await adapter.watch(creds)
    expect(reg.id).toBe('sub-graph-1')
    expect(reg.expiresAt).toBe('2024-07-18T09:00:00Z')
    expect(reg.cursor).toContain('DELTA_TOKEN_1')

    const subCall = calls.find((c) => c.method === 'POST' && c.url.includes('/subscriptions'))
    const subBody = JSON.parse(subCall!.body!) as { resource: string; notificationUrl: string }
    expect(subBody.resource).toBe('/me/messages')
    expect(subBody.notificationUrl).toBe('https://api.revido.example/webhooks/graph')
  })
})
