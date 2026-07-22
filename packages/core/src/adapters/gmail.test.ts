import { describe, expect, it } from 'vitest'
import { GmailAdapter, mapWithConcurrency } from './gmail'
import { decodeBase64Url } from './mime'
import { makeFakeFetch } from './__fixtures__/fake-fetch'
import messagesList from './__fixtures__/gmail/messages-list.json'
import message1 from './__fixtures__/gmail/message-1.json'
import message2 from './__fixtures__/gmail/message-2.json'
import message3 from './__fixtures__/gmail/message-3.json'
import history from './__fixtures__/gmail/history.json'
import sendResponse from './__fixtures__/gmail/send-response.json'

const creds = {
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
}

describe('mapWithConcurrency', () => {
  it('preserves order while respecting the provider concurrency limit', async () => {
    let active = 0
    let peak = 0
    const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (value) => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 2))
      active -= 1
      return value * 10
    })

    expect(results).toEqual([10, 20, 30, 40, 50, 60])
    expect(peak).toBe(2)
  })

  it('handles empty input without invoking the mapper', async () => {
    let calls = 0
    const results = await mapWithConcurrency([], 4, async () => {
      calls += 1
      return 'unexpected'
    })

    expect(results).toEqual([])
    expect(calls).toBe(0)
  })
})

describe('GmailAdapter.backfill', () => {
  it('lists messages, fetches each, and returns the page cursor', async () => {
    const { fetchImpl } = makeFakeFetch([
      { when: (u) => u.includes('/messages/msg-1'), json: message1 },
      { when: (u) => u.includes('/messages/msg-2'), json: message2 },
      { when: (u) => u.includes('/messages?'), json: messagesList },
    ])
    const adapter = new GmailAdapter({ fetchImpl })
    const page = await adapter.backfill(creds)

    expect(page.messages).toHaveLength(2)
    expect(page.nextCursor).toBe('PAGE_TOKEN_2')

    const m1 = page.messages[0]!
    const m2 = page.messages[1]!
    expect(m1.providerMessageId).toBe('msg-1')
    expect(m1.from).toEqual({ name: 'Sam Rivera', email: 'sam@acme.com' })
    expect(m1.to[0]).toEqual({ name: 'Jane Doe', email: 'jane@example.com' })
    expect(m1.cc?.[0]).toEqual({ name: 'Team, Finance', email: 'finance@example.com' })
    expect(m1.subject).toBe('Q3 numbers before Friday')
    expect(m1.html).toContain('Q3 numbers')
    expect(m1.text).toContain('review the Q3 numbers')
    expect(m1.outbound).toBe(false)
    expect(m1.attachments).toEqual([
      {
        providerAttachmentId: 'att-1',
        name: 'q3-summary.pdf',
        mime: 'application/pdf',
        size: 20481,
      },
    ])
    // Message-ID header is captured (used for reply threading).
    expect(m1.headers['message-id']).toBe('<CADX-msg-1@mail.acme.com>')

    // The SENT label marks the reply as outbound.
    expect(m2.outbound).toBe(true)
  })
})

describe('GmailAdapter.incremental', () => {
  it('applies a history delta: fetches added, lists deleted, advances the cursor', async () => {
    const { fetchImpl } = makeFakeFetch([
      { when: (u) => u.includes('/history'), json: history },
      { when: (u) => u.includes('/messages/msg-3'), json: message3 },
    ])
    const adapter = new GmailAdapter({ fetchImpl })
    const delta = await adapter.incremental(creds, '800000')

    expect(delta.upserted).toHaveLength(1)
    expect(delta.upserted[0]?.providerMessageId).toBe('msg-3')
    expect(delta.deletedProviderMessageIds).toContain('msg-old')
    expect(delta.nextCursor).toBe('800100')
  })

  it('skips a message that 404s between history.list and fetch instead of failing the delta', async () => {
    // The history names msg-3 as added, but it vanished (deleted/moved) before we
    // could fetch it — Gmail returns 404. The delta must still succeed: the dead
    // message is skipped, deletes are still reported, and the cursor advances so
    // the job never dead-letters or strands sync.
    const { fetchImpl } = makeFakeFetch([
      { when: (u) => u.includes('/history'), json: history },
      { when: (u) => u.includes('/messages/msg-3'), status: 404, json: { error: 'Not Found' } },
    ])
    const adapter = new GmailAdapter({ fetchImpl })
    const delta = await adapter.incremental(creds, '800000')

    expect(delta.upserted).toEqual([])
    expect(delta.deletedProviderMessageIds).toContain('msg-old')
    expect(delta.nextCursor).toBe('800100')
  })

  it('still propagates a non-404 error while fetching a delta message', async () => {
    const { fetchImpl } = makeFakeFetch([
      { when: (u) => u.includes('/history'), json: history },
      { when: (u) => u.includes('/messages/msg-3'), status: 500, json: { error: 'boom' } },
    ])
    const adapter = new GmailAdapter({ fetchImpl })
    await expect(adapter.incremental(creds, '800000')).rejects.toThrow(/500/)
  })
})

describe('GmailAdapter.send', () => {
  it('builds an RFC822 reply with In-Reply-To/References and the thread id', async () => {
    const { fetchImpl, calls } = makeFakeFetch([
      { when: (u) => u.includes('/messages/send'), json: sendResponse },
      { when: (u) => u.includes('/messages/msg-1'), json: message1 },
    ])
    const adapter = new GmailAdapter({ fetchImpl })
    const res = await adapter.send(creds, {
      to: [{ name: 'Sam Rivera', email: 'sam@acme.com' }],
      subject: 'Re: Q3 numbers before Friday',
      html: '<p>On it — will send by Thursday.</p>',
      text: 'On it — will send by Thursday.',
      inReplyToProviderMessageId: 'msg-1',
    })

    expect(res.providerMessageId).toBe('msg-sent-1')

    const sendCall = calls.find((c) => c.method === 'POST' && c.url.includes('/messages/send'))
    expect(sendCall).toBeDefined()
    const payload = JSON.parse(sendCall!.body!) as { raw: string; threadId?: string }
    // Reply is threaded via the parent's Gmail threadId.
    expect(payload.threadId).toBe('thread-a')

    const raw = decodeBase64Url(payload.raw)
    // A display name of plain atoms needs no quoting per RFC 5322.
    expect(raw).toContain('To: Sam Rivera <sam@acme.com>')
    expect(raw).toContain('Subject: Re: Q3 numbers before Friday')
    expect(raw).toContain('In-Reply-To: <CADX-msg-1@mail.acme.com>')
    // References chains the parent's References plus the parent Message-ID.
    expect(raw).toContain('References: <CADX-root@mail.acme.com> <CADX-msg-1@mail.acme.com>')
    expect(raw).toContain('Content-Type: multipart/alternative')
  })

  it('emits a multipart/mixed with a base64 attachment part', async () => {
    const { fetchImpl, calls } = makeFakeFetch([
      { when: (u) => u.includes('/messages/send'), json: sendResponse },
    ])
    const adapter = new GmailAdapter({ fetchImpl })
    const content = Buffer.from('hello attachment')
    const res = await adapter.send(creds, {
      to: [{ name: 'Sam Rivera', email: 'sam@acme.com' }],
      subject: 'Here is the file',
      html: '<p>See attached.</p>',
      text: 'See attached.',
      attachments: [{ name: 'notes.txt', mime: 'text/plain', content }],
    })

    expect(res.providerMessageId).toBe('msg-sent-1')
    const sendCall = calls.find((c) => c.method === 'POST' && c.url.includes('/messages/send'))
    const payload = JSON.parse(sendCall!.body!) as { raw: string }
    const raw = decodeBase64Url(payload.raw)
    // The top-level part is now multipart/mixed, wrapping the alternative body.
    expect(raw).toContain('Content-Type: multipart/mixed')
    expect(raw).toContain('Content-Type: multipart/alternative')
    // The attachment part carries the name + base64-encoded content.
    expect(raw).toContain('Content-Type: text/plain; name="notes.txt"')
    expect(raw).toContain('Content-Disposition: attachment; filename="notes.txt"')
    expect(raw).toContain('Content-Transfer-Encoding: base64')
    expect(raw).toContain(content.toString('base64'))
  })
})

describe('GmailAdapter.connect', () => {
  it('returns credentials unchanged while the access token is still valid', async () => {
    const { fetchImpl, calls } = makeFakeFetch([])
    const adapter = new GmailAdapter({ fetchImpl })
    const out = await adapter.connect(creds)
    expect(out).toBe(creds)
    expect(calls).toHaveLength(0) // no network call when the token is fresh
  })

  it('refreshes an expired access token via the OAuth token endpoint', async () => {
    const { fetchImpl, calls } = makeFakeFetch([
      {
        when: (u) => u.includes('oauth2.googleapis.com/token'),
        json: { access_token: 'fresh-token', expires_in: 3600 },
      },
    ])
    const adapter = new GmailAdapter({
      fetchImpl,
      oauthClientId: 'cid',
      oauthClientSecret: 'secret',
    })
    const expired = { ...creds, expiresAt: new Date(Date.now() - 1000).toISOString() }
    const out = await adapter.connect(expired)
    expect(out.accessToken).toBe('fresh-token')
    expect(out.refreshToken).toBe('refresh')
    expect(Date.parse(out.expiresAt)).toBeGreaterThan(Date.now())
    expect(calls).toHaveLength(1)
  })
})

describe('GmailAdapter.watch', () => {
  it('registers a Pub/Sub watch and returns the starting historyId cursor', async () => {
    const { fetchImpl, calls } = makeFakeFetch([
      {
        when: (u) => u.includes('/watch'),
        json: { historyId: '900100', expiration: '1721260800000' },
      },
    ])
    const adapter = new GmailAdapter({
      fetchImpl,
      watchTopic: 'projects/revido/topics/gmail',
    })
    const reg = await adapter.watch(creds)
    expect(reg.cursor).toBe('900100')
    expect(reg.id).toBe('projects/revido/topics/gmail')
    expect(Date.parse(reg.expiresAt)).toBe(1721260800000)
    const body = JSON.parse(calls[0]!.body!) as { topicName: string }
    expect(body.topicName).toBe('projects/revido/topics/gmail')
  })
})
