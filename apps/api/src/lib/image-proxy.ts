/**
 * Server-side image proxy — SSRF-guarded remote-image fetch + HTML rewriting.
 *
 * Remote images in email are a privacy (tracking-pixel) and SSRF hazard, so the
 * client never loads them directly. Instead:
 *
 *  1. `GET /image-proxy?url=` (see `routes/image-proxy.ts`) fetches the image
 *     server-side, stripped of cookies/referrer, and re-serves the bytes — but
 *     only after {@link assertPublicUrl} proves the target is a public http(s)
 *     host (no loopback / private / link-local / metadata address, no odd port,
 *     redirects re-validated per hop), and only if it is a bounded-size raster
 *     image (SVG is refused — it can carry script).
 *  2. `rewriteImagesToProxy` rewrites every remote `<img src>` in a sanitized body
 *     to point at that proxy, so a revealed image is always fetched through the
 *     guarded path. Blocked (un-revealed) bodies keep their original remote srcs,
 *     which the render iframe's own `img-src` CSP refuses to load.
 *
 * DEFAULT-BLOCK throughout: anything the guards can't positively clear is refused.
 */
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { HttpError } from './http'

/** Hard cap on a proxied image; a lying `content-length` is caught while streaming. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
/** Per-request upstream timeout. */
const TIMEOUT_MS = 8_000
/** Redirect hops to follow, each re-validated by {@link assertPublicUrl}. */
const MAX_REDIRECTS = 3
/** Only fetch from the standard web ports. */
const ALLOWED_PORTS = new Set(['', '80', '443'])

/**
 * Raster image types we re-serve. `image/svg+xml` is deliberately excluded — SVG
 * is an active document (script/foreignObject) even sandboxed, so it stays blocked.
 */
const ALLOWED_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/tiff',
  'image/x-icon',
  'image/vnd.microsoft.icon',
])

/** A fetched, validated image ready to re-serve. */
export interface ProxiedImage {
  contentType: string
  body: Uint8Array
}

// ---------------------------------------------------------------------------
// SSRF address guards
// ---------------------------------------------------------------------------

/** Parse a dotted-quad IPv4 into a 32-bit unsigned int, or `null` if malformed. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    value = value * 256 + octet
  }
  return value >>> 0
}

/** True if the IPv4 falls in any non-public (private/reserved/loopback…) range. */
function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip)
  if (n === null) return true // unparseable ⇒ refuse
  const inRange = (base: string, bits: number): boolean => {
    const b = ipv4ToInt(base)
    if (b === null) return false
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
    return (n & mask) === (b & mask)
  }
  return (
    inRange('0.0.0.0', 8) || // "this" network
    inRange('10.0.0.0', 8) || // private
    inRange('100.64.0.0', 10) || // CGNAT
    inRange('127.0.0.0', 8) || // loopback
    inRange('169.254.0.0', 16) || // link-local (incl. 169.254.169.254 metadata)
    inRange('172.16.0.0', 12) || // private
    inRange('192.0.0.0', 24) || // IETF protocol assignments
    inRange('192.0.2.0', 24) || // TEST-NET-1
    inRange('192.88.99.0', 24) || // 6to4 relay anycast
    inRange('192.168.0.0', 16) || // private
    inRange('198.18.0.0', 15) || // benchmarking
    inRange('198.51.100.0', 24) || // TEST-NET-2
    inRange('203.0.113.0', 24) || // TEST-NET-3
    inRange('224.0.0.0', 4) || // multicast
    inRange('240.0.0.0', 4) // reserved / broadcast
  )
}

/** True if the IPv6 address is loopback/unspecified/ULA/link-local/multicast/mapped-private. */
function isBlockedIpv6(ip: string): boolean {
  const addr = ip.toLowerCase().split('%')[0] ?? '' // drop any zone id
  if (addr === '::1' || addr === '::') return true
  // IPv4-mapped / -translated (::ffff:a.b.c.d, ::a.b.c.d, 64:ff9b::a.b.c.d): judge the embedded v4.
  const mapped = addr.match(/(?:::ffff:|::|:)((?:\d{1,3}\.){3}\d{1,3})$/)
  if (mapped?.[1]) return isBlockedIpv4(mapped[1])
  const head = addr.split(':')[0] ?? ''
  const h = parseInt(head || '0', 16)
  if (Number.isNaN(h)) return true
  if ((h & 0xfe00) === 0xfc00) return true // fc00::/7 unique-local
  if ((h & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((h & 0xff00) === 0xff00) return true // ff00::/8 multicast
  return false
}

/** True if an IP literal (either family) is non-public. Unknown families are refused. */
export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip)
  if (family === 4) return isBlockedIpv4(ip)
  if (family === 6) return isBlockedIpv6(ip)
  return true
}

/**
 * Validate a URL for outbound fetch: http(s) only, a standard port, no embedded
 * credentials, and every DNS-resolved address must be public. Throws an
 * {@link HttpError} otherwise. Returns the parsed URL.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new HttpError(400, 'invalid_url', 'The image URL is not a valid absolute URL.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HttpError(400, 'unsupported_scheme', 'Only http(s) image URLs are proxied.')
  }
  if (url.username || url.password) {
    throw new HttpError(400, 'url_has_credentials', 'Credentialed URLs are not proxied.')
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new HttpError(400, 'blocked_port', 'Only standard web ports are proxied.')
  }

  const host = url.hostname
  // A bare IP host: judge it directly (no DNS to trust).
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new HttpError(403, 'blocked_host', 'Refusing to fetch a non-public address.')
    return url
  }
  // A name: resolve and require EVERY answer to be public (a hostile resolver
  // could return a mix, and any private answer could be the one connected to).
  let records: { address: string }[]
  try {
    records = await lookup(host, { all: true })
  } catch {
    throw new HttpError(502, 'dns_failed', 'Could not resolve the image host.')
  }
  if (records.length === 0) throw new HttpError(502, 'dns_failed', 'Could not resolve the image host.')
  for (const record of records) {
    if (isBlockedAddress(record.address)) {
      throw new HttpError(403, 'blocked_host', 'The image host resolves to a non-public address.')
    }
  }
  return url
}

// ---------------------------------------------------------------------------
// Fetch + re-serve
// ---------------------------------------------------------------------------

/**
 * Read a response body, aborting past `max` bytes (guards against a lying
 * content-length) AND when `signal` fires (the overall wall-clock deadline). The
 * signal bound is what stops a slowloris upstream from dribbling the body forever
 * after the headers arrive.
 */
async function readCapped(res: Response, max: number, signal: AbortSignal): Promise<Uint8Array> {
  const reader = res.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.length
      if (total > max) {
        await reader.cancel()
        throw new HttpError(413, 'image_too_large', 'The image exceeds the proxy size limit.')
      }
      chunks.push(value)
    }
  } catch (err) {
    if (err instanceof HttpError) throw err
    // An abort (deadline) surfaces here as the reader rejects; map it to a timeout.
    if (signal.aborted) {
      throw new HttpError(504, 'image_timeout', 'The image took too long to download.')
    }
    throw new HttpError(502, 'image_fetch_failed', 'The image stream failed.')
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

/** Normalize a `content-type` header to its bare media type, lowercased. */
function mediaType(header: string | null): string {
  return (header ?? '').split(';')[0]!.trim().toLowerCase()
}

/** Overrides for {@link fetchProxiedImage} (tests inject a clock/fetch). */
export interface FetchProxiedImageOptions {
  /** Overall wall-clock budget covering ALL hops AND the body read. */
  timeoutMs?: number
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch
}

/**
 * Fetch a remote image through the SSRF guards, following (and re-validating)
 * redirects, enforcing the size + content-type caps and a single OVERALL deadline.
 * The one deadline spans every redirect hop AND the streaming body read — clearing
 * it only after the body is read (not once headers arrive), so a slowloris upstream
 * that stalls mid-body is aborted rather than held open indefinitely. Never forwards
 * cookies, referrer, or auth. Throws an {@link HttpError} on any refusal.
 */
export async function fetchProxiedImage(
  rawUrl: string,
  opts: FetchProxiedImageOptions = {},
): Promise<ProxiedImage> {
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS
  const fetchImpl = opts.fetchImpl ?? fetch
  let target = await assertPublicUrl(rawUrl)

  // One controller + deadline for the whole operation (connect, redirects, body).
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let res: Response
      try {
        res = await fetchImpl(target, {
          method: 'GET',
          redirect: 'manual', // follow by hand so each hop is re-validated
          signal: controller.signal,
          headers: {
            accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.5',
            'user-agent': 'RevidoMail-ImageProxy/1.0',
          },
        })
      } catch {
        if (controller.signal.aborted) {
          throw new HttpError(504, 'image_timeout', 'The image took too long to download.')
        }
        throw new HttpError(502, 'image_fetch_failed', 'The image could not be fetched.')
      }

      // Manual redirect handling: re-validate the next hop before following it.
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location')
        if (!location || hop === MAX_REDIRECTS) {
          throw new HttpError(502, 'too_many_redirects', 'The image redirected too many times.')
        }
        target = await assertPublicUrl(new URL(location, target).toString())
        continue
      }

      if (!res.ok) {
        throw new HttpError(502, 'image_upstream_error', `The image host returned ${res.status}.`)
      }

      const type = mediaType(res.headers.get('content-type'))
      if (!ALLOWED_CONTENT_TYPES.has(type)) {
        throw new HttpError(415, 'unsupported_image_type', 'The URL did not return a supported image.')
      }
      const declaredLength = Number(res.headers.get('content-length') ?? '')
      if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
        throw new HttpError(413, 'image_too_large', 'The image exceeds the proxy size limit.')
      }
      // Body read is still bound by the same controller/deadline (slowloris guard).
      const body = await readCapped(res, MAX_IMAGE_BYTES, controller.signal)
      return { contentType: type, body }
    }
    // Unreachable: the loop either returns or throws.
    throw new HttpError(502, 'too_many_redirects', 'The image redirected too many times.')
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// HTML rewriting
// ---------------------------------------------------------------------------

/** The public base for proxy URLs; absolute (`BETTER_AUTH_URL`) so it resolves from the render iframe. */
export function imageProxyBase(env: NodeJS.ProcessEnv = process.env): string {
  const origin = (env.BETTER_AUTH_URL ?? '').replace(/\/$/, '')
  return `${origin}/image-proxy`
}

/** Decode the handful of HTML entities that appear inside `src`/URL attributes. */
function decodeAttr(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&#38;/g, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
}

/** Build a proxy URL for a remote http(s) image, or `null` for data:/cid:/relative srcs. */
function toProxyUrl(rawSrc: string, base: string): string | null {
  const src = decodeAttr(rawSrc.trim())
  if (!/^https?:\/\//i.test(src)) return null // data:, cid:, relative — leave alone
  return `${base}?url=${encodeURIComponent(src)}`
}

/**
 * Rewrite every remote `<img src>` in a sanitized HTML body to the image proxy,
 * and strip `srcset` (so a responsive candidate can't bypass the proxy). Called
 * by `load-images` when the user reveals images for a message.
 */
export function rewriteImagesToProxy(html: string, base: string): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    let out = tag.replace(/\bsrc\s*=\s*("|')(.*?)\1/gi, (match, quote: string, url: string) => {
      const proxied = toProxyUrl(url, base)
      return proxied ? `src=${quote}${proxied}${quote}` : match
    })
    out = out.replace(/\bsrcset\s*=\s*("|').*?\1/gi, '')
    return out
  })
}
