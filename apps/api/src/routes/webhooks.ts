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
 * service-account email), `GRAPH_CLIENT_STATE` (subscription shared secret). These
 * verification claims are OPTIONAL for local/dev (skipped when unset) but REQUIRED
 * in production: `requireInProd` refuses the webhook (500) if any is missing under
 * `NODE_ENV==='production'`, so the checks can never silently fail open on a real
 * deploy. Signature / issuer / expiry (see `lib/oidc`) are always enforced.
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

/**
 * A verification secret that MUST be present in production. Returns the value in
 * dev (possibly undefined ⇒ that specific claim check is skipped); refuses the
 * webhook in production when absent, so verification never silently fails open.
 */
function requireInProd(value: string | undefined, name: string): string | undefined {
  if (!value && process.env.NODE_ENV === 'production') {
    throw new HttpError(500, 'webhook_misconfigured', `${name} must be set in production`)
  }
  return value
}

/** POST /webhooks/gmail — verified Gmail Pub/Sub push. */
webhooksRouter.post('/gmail', async (c) => {
  const audience = requireInProd(process.env.GMAIL_PUSH_AUDIENCE, 'GMAIL_PUSH_AUDIENCE')
  const email = requireInProd(process.env.GMAIL_PUSH_SA_EMAIL, 'GMAIL_PUSH_SA_EMAIL')
  const token = bearerToken(c.req.header('authorization'))
  await verifyGoogleOidcToken(token, { audience, email })

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
  const expectedClientState = requireInProd(process.env.GRAPH_CLIENT_STATE, 'GRAPH_CLIENT_STATE')
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
