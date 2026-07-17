/**
 * Provider push webhooks — the freshness trigger for `apps/worker`.
 *
 *   POST /webhooks/gmail — verify Google's signed OIDC push JWT (bearer + audience),
 *     decode the Pub/Sub envelope, and enqueue an `incremental` job. 200.
 *   POST /webhooks/graph — echo the `validationToken` query param as text/plain on
 *     the subscription-creation handshake; otherwise verify `clientState` and
 *     enqueue an `incremental` job per notification. 202.
 *
 * Neither route is session-gated (the caller is a provider, not a user), so both
 * lean on cryptographic/secret verification and the shared IP rate limiter.
 *
 * Env: `GMAIL_PUSH_AUDIENCE` (expected `aud`), `GMAIL_PUSH_SA_EMAIL` (expected push
 * service-account email), `GRAPH_CLIENT_STATE` (subscription shared secret).
 */
import { Hono } from 'hono'
import { errorHandler, HttpError } from '../lib/http'
import { enqueueJob, JobQueue } from '../lib/jobs'
import { bearerToken, verifyGoogleOidcToken } from '../lib/oidc'
import { rateLimit } from '../lib/rate-limit'
import type { Variables } from '../middleware/auth'

export const webhooksRouter = new Hono<{ Variables: Variables }>()
webhooksRouter.onError(errorHandler)
webhooksRouter.use('*', rateLimit({ windowMs: 60_000, max: 120 }))

/** POST /webhooks/gmail — verified Gmail Pub/Sub push. */
webhooksRouter.post('/gmail', async (c) => {
  const token = bearerToken(c.req.header('authorization'))
  await verifyGoogleOidcToken(token, {
    audience: process.env.GMAIL_PUSH_AUDIENCE,
    email: process.env.GMAIL_PUSH_SA_EMAIL,
  })

  const body = (await c.req.json().catch(() => ({}))) as {
    message?: { data?: string }
  }
  const data = body.message?.data
  if (data) {
    let decoded: { emailAddress?: string; historyId?: string | number } = {}
    try {
      decoded = JSON.parse(Buffer.from(data, 'base64').toString('utf8'))
    } catch {
      throw new HttpError(400, 'bad_envelope')
    }
    if (decoded.emailAddress && decoded.historyId != null) {
      await enqueueJob(JobQueue.incremental, {
        provider: 'gmail',
        emailAddress: decoded.emailAddress,
        historyId: String(decoded.historyId),
      })
    }
  }
  return c.json({ ok: true })
})

/** POST /webhooks/graph — Microsoft Graph handshake + change notifications. */
webhooksRouter.post('/graph', async (c) => {
  // Subscription-creation handshake: echo the token verbatim as text/plain.
  const validationToken = c.req.query('validationToken')
  if (validationToken) {
    return c.text(validationToken, 200)
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    value?: {
      subscriptionId?: string
      clientState?: string
      resource?: string
      changeType?: string
      tenantId?: string
    }[]
  }
  const expectedClientState = process.env.GRAPH_CLIENT_STATE
  const notifications = body.value ?? []

  for (const n of notifications) {
    if (expectedClientState && n.clientState !== expectedClientState) {
      throw new HttpError(403, 'bad_client_state')
    }
    if (n.subscriptionId && n.resource) {
      await enqueueJob(JobQueue.incremental, {
        provider: 'outlook',
        subscriptionId: n.subscriptionId,
        resource: n.resource,
        changeType: n.changeType ?? 'updated',
        ...(n.tenantId ? { tenantId: n.tenantId } : {}),
      })
    }
  }
  return c.json({ ok: true }, 202)
})
