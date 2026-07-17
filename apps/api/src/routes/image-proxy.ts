/**
 * `GET /image-proxy?url=` — the SSRF-guarded, tracking-stripping image relay.
 *
 * Session-gated (no open proxy) and per-IP rate limited. Fetches the remote image
 * server-side via {@link fetchProxiedImage} — which enforces the SSRF address
 * guards, size/content-type caps, redirect re-validation, and timeout — then
 * re-serves the bytes with a locked-down header set (nosniff, inline, no CSP
 * surface). The "Show images" flow rewrites message `<img src>` to point here
 * (see `routes/messages.ts` + `lib/image-proxy.ts`).
 */
import { Hono } from 'hono'
import { errorHandler, HttpError } from '../lib/http'
import { fetchProxiedImage } from '../lib/image-proxy'
import { rateLimit } from '../lib/rate-limit'
import { requireUser, type Variables } from '../middleware/auth'

export const imageProxyRouter = new Hono<{ Variables: Variables }>()
imageProxyRouter.onError(errorHandler)
// Bound outbound fetches per source IP, then require a session.
imageProxyRouter.use('*', rateLimit({ windowMs: 60_000, max: 120 }))
imageProxyRouter.use('*', requireUser)

/** GET /image-proxy?url= — fetch + re-serve a single remote image. */
imageProxyRouter.get('/', async (c) => {
  const url = c.req.query('url')
  if (!url) throw new HttpError(400, 'missing_url', 'A `url` query parameter is required.')

  const image = await fetchProxiedImage(url)

  c.header('Content-Type', image.contentType)
  // Private (per-user) cache; the bytes are re-served, never hot-linked.
  c.header('Cache-Control', 'private, max-age=3600')
  c.header('Content-Disposition', 'inline')
  // The global middleware already set the strict header set (nosniff etc.).
  const body = image.body.buffer.slice(
    image.body.byteOffset,
    image.body.byteOffset + image.body.byteLength,
  ) as ArrayBuffer
  return c.body(body)
})
