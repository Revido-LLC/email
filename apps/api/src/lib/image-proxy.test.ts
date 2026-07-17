/**
 * Tests for the SSRF guards, the guarded fetch, and the `<img>` rewriter.
 *
 * `node:dns/promises` `lookup` and the global `fetch` are mocked so the guards
 * and the fetch pipeline are exercised without real network I/O.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import {
  assertPublicUrl,
  fetchProxiedImage,
  imageProxyBase,
  isBlockedAddress,
  MAX_IMAGE_BYTES,
  rewriteImagesToProxy,
} from './image-proxy'
import { HttpError } from './http'

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }))
const { lookup } = await import('node:dns/promises')
const lookupMock = lookup as unknown as Mock

/** A resolver that says "this host is a public address". */
function resolvesPublic() {
  lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
}

beforeEach(() => {
  lookupMock.mockReset()
  resolvesPublic()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isBlockedAddress', () => {
  it.each([
    ['127.0.0.1', true],
    ['10.1.2.3', true],
    ['172.16.5.4', true],
    ['192.168.0.5', true],
    ['169.254.169.254', true], // cloud metadata
    ['100.64.0.1', true], // CGNAT
    ['0.0.0.0', true],
    ['8.8.8.8', false],
    ['93.184.216.34', false],
    ['::1', true],
    ['fe80::1', true],
    ['fc00::abcd', true],
    ['::ffff:127.0.0.1', true], // IPv4-mapped loopback
    ['2606:4700:4700::1111', false],
    ['not-an-ip', true], // unparseable ⇒ refuse
  ])('%s → blocked=%s', (ip, blocked) => {
    expect(isBlockedAddress(ip)).toBe(blocked)
  })
})

describe('assertPublicUrl', () => {
  it('rejects non-http(s) schemes', async () => {
    await expect(assertPublicUrl('ftp://example.com/x.png')).rejects.toBeInstanceOf(HttpError)
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toBeInstanceOf(HttpError)
  })

  it('rejects embedded credentials and odd ports', async () => {
    await expect(assertPublicUrl('http://user:pass@example.com/x.png')).rejects.toMatchObject({
      status: 400,
    })
    await expect(assertPublicUrl('http://example.com:2222/x.png')).rejects.toMatchObject({
      code: 'blocked_port',
    })
  })

  it('rejects a literal private/loopback IP host without any DNS', async () => {
    await expect(assertPublicUrl('http://127.0.0.1/x.png')).rejects.toMatchObject({
      status: 403,
    })
    await expect(assertPublicUrl('http://169.254.169.254/latest/meta-data')).rejects.toMatchObject({
      status: 403,
    })
    expect(lookupMock).not.toHaveBeenCalled()
  })

  it('rejects a hostname that resolves to a private address', async () => {
    lookupMock.mockResolvedValue([{ address: '10.0.0.5', family: 4 }])
    await expect(assertPublicUrl('https://evil.example.com/x.png')).rejects.toMatchObject({
      code: 'blocked_host',
    })
  })

  it('rejects when ANY resolved address is private (mixed answer)', async () => {
    lookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ])
    await expect(assertPublicUrl('https://mixed.example.com/x.png')).rejects.toMatchObject({
      code: 'blocked_host',
    })
  })

  it('accepts a public host', async () => {
    const url = await assertPublicUrl('https://cdn.example.com/logo.png')
    expect(url.hostname).toBe('cdn.example.com')
  })
})

/** Build a fake fetch Response with a byte body + headers. */
function imageResponse(bytes: number, contentType = 'image/png', extra: Record<string, string> = {}) {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'content-type': contentType, ...extra },
  })
}

describe('fetchProxiedImage', () => {
  it('fetches a valid image and returns the bytes + type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(imageResponse(8, 'image/png')))
    const out = await fetchProxiedImage('https://cdn.example.com/a.png')
    expect(out.contentType).toBe('image/png')
    expect(out.body.length).toBe(8)
  })

  it('refuses SVG (active content)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(imageResponse(8, 'image/svg+xml')))
    await expect(fetchProxiedImage('https://cdn.example.com/a.svg')).rejects.toMatchObject({
      code: 'unsupported_image_type',
    })
  })

  it('refuses non-image content types', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(imageResponse(8, 'text/html')))
    await expect(fetchProxiedImage('https://cdn.example.com/a.png')).rejects.toMatchObject({
      status: 415,
    })
  })

  it('refuses an oversized image by declared content-length', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        imageResponse(8, 'image/png', { 'content-length': String(MAX_IMAGE_BYTES + 1) }),
      ),
    )
    await expect(fetchProxiedImage('https://cdn.example.com/a.png')).rejects.toMatchObject({
      status: 413,
    })
  })

  it('follows a redirect and re-validates the next hop', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: 'https://cdn2.example.com/b.png' } }),
      )
      .mockResolvedValueOnce(imageResponse(4, 'image/jpeg'))
    vi.stubGlobal('fetch', fetchMock)
    const out = await fetchProxiedImage('https://cdn.example.com/a.png')
    expect(out.contentType).toBe('image/jpeg')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rejects a redirect to a private address', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchProxiedImage('https://cdn.example.com/a.png')).rejects.toMatchObject({
      status: 403,
    })
  })

  it('enforces the overall deadline across the streaming body read (slowloris)', async () => {
    // Headers arrive fine, then the body emits one chunk and stalls forever. A real
    // fetch errors its body stream when the request signal aborts; we mimic that so
    // the read rejects, and assert the overall deadline maps it to a 504 timeout.
    const fetchImpl = vi.fn((_input: unknown, init?: { signal?: AbortSignal }) => {
      const signal = init?.signal
      const body = new ReadableStream<Uint8Array>({
        start(ctrl) {
          ctrl.enqueue(new Uint8Array([1, 2, 3]))
          const abort = (): void => ctrl.error(new DOMException('aborted', 'AbortError'))
          if (signal?.aborted) abort()
          else signal?.addEventListener('abort', abort)
          // Otherwise never close/enqueue → the read loop would hang without the deadline.
        },
      })
      return Promise.resolve(
        new Response(body, { status: 200, headers: { 'content-type': 'image/png' } }),
      )
    }) as unknown as typeof fetch

    await expect(
      fetchProxiedImage('https://cdn.example.com/slow.png', { timeoutMs: 20, fetchImpl }),
    ).rejects.toMatchObject({ code: 'image_timeout' })
  })
})

describe('imageProxyBase', () => {
  it('builds an absolute base from BETTER_AUTH_URL', () => {
    expect(imageProxyBase({ BETTER_AUTH_URL: 'https://api.revido.co/' } as NodeJS.ProcessEnv)).toBe(
      'https://api.revido.co/image-proxy',
    )
  })
  it('falls back to a relative path when unset', () => {
    expect(imageProxyBase({} as NodeJS.ProcessEnv)).toBe('/image-proxy')
  })
})

describe('rewriteImagesToProxy', () => {
  const base = 'https://api.revido.co/image-proxy'

  it('rewrites remote img srcs to the proxy', () => {
    const html = '<p>hi</p><img src="https://track.er/pixel.gif?u=1&amp;c=2" width="1">'
    const out = rewriteImagesToProxy(html, base)
    expect(out).toContain(
      `src="https://api.revido.co/image-proxy?url=${encodeURIComponent('https://track.er/pixel.gif?u=1&c=2')}"`,
    )
  })

  it('leaves data: and cid: images alone', () => {
    const html = '<img src="data:image/png;base64,AAAA"><img src="cid:logo@x">'
    expect(rewriteImagesToProxy(html, base)).toBe(html)
  })

  it('strips srcset so responsive candidates cannot bypass the proxy', () => {
    const html = '<img src="https://track.er/a.png" srcset="https://track.er/a2.png 2x">'
    const out = rewriteImagesToProxy(html, base)
    expect(out).not.toContain('srcset')
    expect(out).toContain('image-proxy?url=')
  })
})
