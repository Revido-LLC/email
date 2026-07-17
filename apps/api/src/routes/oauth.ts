/**
 * OAuth connect flow for an ADDITIONAL mailbox.
 *
 * Primary sign-in is Better Auth's job (`/api/auth/*`); this pair lets an
 * already-signed-in user connect a second Gmail/Outlook mailbox:
 *
 *   POST /auth/oauth/:provider/start    → { redirectUrl }  (session-gated)
 *   GET  /auth/oauth/:provider/callback → 302 /onboarding  (state-gated)
 *
 * `start` builds the provider authorize URL with an HMAC-signed `state` carrying
 * the caller's user id; `callback` verifies that state, exchanges the code for
 * tokens, resolves the mailbox address, and hands off to {@link linkMailbox}
 * (encrypt tokens into `accounts` + enqueue `backfill`). `:provider` is
 * `gmail | outlook`.
 *
 * Env: `BETTER_AUTH_URL` (callback origin), `GOOGLE_CLIENT_ID/SECRET`,
 * `MS_CLIENT_ID/SECRET`, `MS_TENANT_ID` (default `common`), `BETTER_AUTH_SECRET`
 * (state signing), `WEB_ORIGIN` (post-connect redirect target).
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { requireUser, type Variables } from '../middleware/auth'
import { errorHandler, HttpError } from '../lib/http'
import { linkMailbox } from '../lib/mailbox-link'
import { rateLimit } from '../lib/rate-limit'
import type { Provider } from '@revido/db'

interface ProviderConfig {
  betterAuthId: 'google' | 'microsoft'
  authorizeUrl: () => string
  tokenUrl: () => string
  scopes: string[]
  clientId: () => string | undefined
  clientSecret: () => string | undefined
  userInfo: (accessToken: string) => Promise<{ email: string; name?: string }>
}

function msTenant(): string {
  return process.env.MS_TENANT_ID ?? 'common'
}

const PROVIDERS: Record<Provider, ProviderConfig> = {
  gmail: {
    betterAuthId: 'google',
    authorizeUrl: () => 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: () => 'https://oauth2.googleapis.com/token',
    scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.modify'],
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    userInfo: async (accessToken) => {
      const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) throw new HttpError(502, 'userinfo_failed')
      const data = (await res.json()) as { email?: string; name?: string }
      if (!data.email) throw new HttpError(502, 'userinfo_no_email')
      return { email: data.email, name: data.name }
    },
  },
  outlook: {
    betterAuthId: 'microsoft',
    authorizeUrl: () => `https://login.microsoftonline.com/${msTenant()}/oauth2/v2.0/authorize`,
    tokenUrl: () => `https://login.microsoftonline.com/${msTenant()}/oauth2/v2.0/token`,
    scopes: [
      'openid',
      'email',
      'profile',
      'offline_access',
      'https://graph.microsoft.com/Mail.ReadWrite',
      'https://graph.microsoft.com/Mail.Send',
    ],
    clientId: () => process.env.MS_CLIENT_ID,
    clientSecret: () => process.env.MS_CLIENT_SECRET,
    userInfo: async (accessToken) => {
      const res = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) throw new HttpError(502, 'userinfo_failed')
      const data = (await res.json()) as {
        mail?: string
        userPrincipalName?: string
        displayName?: string
      }
      const email = data.mail ?? data.userPrincipalName
      if (!email) throw new HttpError(502, 'userinfo_no_email')
      return { email, name: data.displayName }
    },
  },
}

function parseProvider(raw: string): Provider {
  if (raw === 'gmail' || raw === 'outlook') return raw
  throw new HttpError(400, 'unknown_provider')
}

function requireEnv(value: string | undefined, code: string): string {
  if (!value) throw new HttpError(500, code)
  return value
}

// --- HMAC-signed state (userId + provider + freshness) ---------------------

interface StateClaims {
  userId: string
  provider: Provider
  nonce: string
  iat: number
}

const STATE_TTL_MS = 10 * 60 * 1000

/**
 * Per-flow CSRF nonce cookie. The same random `nonce` is embedded in the signed
 * state AND set here as an httpOnly, SameSite=Lax cookie at `/start`; the callback
 * requires both to match, so only the browser that began the flow can complete it
 * (the signed state alone can't bind the flow to a browser). SameSite=Lax so the
 * cookie survives the provider's top-level GET redirect back to the callback.
 */
const NONCE_COOKIE = 'rm_oauth_nonce'
const OAUTH_COOKIE_PATH = '/auth/oauth'

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

function signState(claims: StateClaims): string {
  const secret = requireEnv(process.env.BETTER_AUTH_SECRET, 'missing_auth_secret')
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

function verifyState(state: string | undefined): StateClaims {
  if (!state) throw new HttpError(400, 'missing_state')
  const secret = requireEnv(process.env.BETTER_AUTH_SECRET, 'missing_auth_secret')
  const [payload, sig] = state.split('.')
  if (!payload || !sig) throw new HttpError(400, 'invalid_state')
  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, 'bad_state_signature')
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as StateClaims
  if (Date.now() - claims.iat > STATE_TTL_MS) throw new HttpError(401, 'state_expired')
  return claims
}

function callbackUrl(provider: Provider): string {
  const base = requireEnv(process.env.BETTER_AUTH_URL, 'missing_base_url').replace(/\/$/, '')
  return `${base}/auth/oauth/${provider}/callback`
}

export const oauthRouter = new Hono<{ Variables: Variables }>()
oauthRouter.onError(errorHandler)
oauthRouter.use('*', rateLimit({ windowMs: 60_000, max: 30 }))

/** POST /auth/oauth/:provider/start — build the provider authorize URL. */
oauthRouter.post('/:provider/start', requireUser, (c) => {
  const provider = parseProvider(c.req.param('provider'))
  const config = PROVIDERS[provider]
  const userId = c.get('userId')
  const clientId = requireEnv(config.clientId(), 'missing_client_id')

  const nonce = randomUUID()
  const state = signState({ userId, provider, nonce, iat: Date.now() })
  // Bind the flow to this browser: the callback requires this cookie to match the
  // nonce inside the signed state (CSRF defense for mailbox linking).
  setCookie(c, NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: OAUTH_COOKIE_PATH,
    maxAge: STATE_TTL_MS / 1000,
  })
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl(provider),
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
    access_type: 'offline',
    prompt: 'consent',
  })
  return c.json({ redirectUrl: `${config.authorizeUrl()}?${params.toString()}` })
})

/**
 * GET /auth/oauth/:provider/callback — exchange code, link mailbox, redirect.
 *
 * `requireUser`-gated (the Better Auth session cookie is SameSite=Lax, so it rides
 * the provider's top-level GET redirect). Linking is bound three ways so a forged
 * callback can't attach a mailbox to someone else's account: the signed state, the
 * session user matching `claims.userId`, and the per-flow nonce cookie.
 */
oauthRouter.get('/:provider/callback', requireUser, async (c) => {
  const provider = parseProvider(c.req.param('provider'))
  const config = PROVIDERS[provider]
  const code = c.req.query('code')
  if (!code) throw new HttpError(400, 'missing_code')
  const claims = verifyState(c.req.query('state'))
  if (claims.provider !== provider) throw new HttpError(400, 'provider_mismatch')

  // CSRF: the state's user must be the currently-authenticated user...
  if (c.get('userId') !== claims.userId) {
    throw new HttpError(401, 'state_session_mismatch')
  }
  // ...and the per-flow nonce cookie must match the nonce inside the signed state.
  const cookieNonce = getCookie(c, NONCE_COOKIE)
  if (!cookieNonce || !safeEqual(cookieNonce, claims.nonce)) {
    throw new HttpError(401, 'oauth_state_mismatch')
  }
  deleteCookie(c, NONCE_COOKIE, { path: OAUTH_COOKIE_PATH })

  const clientId = requireEnv(config.clientId(), 'missing_client_id')
  const clientSecret = requireEnv(config.clientSecret(), 'missing_client_secret')

  const tokenRes = await fetch(config.tokenUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: callbackUrl(provider),
    }),
  })
  if (!tokenRes.ok) throw new HttpError(502, 'token_exchange_failed')
  const tokens = (await tokenRes.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    scope?: string
  }
  if (!tokens.access_token) throw new HttpError(502, 'no_access_token')

  const { email, name } = await config.userInfo(tokens.access_token)
  const tokenExpiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null

  await linkMailbox(claims.userId, {
    provider,
    email,
    name,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    tokenExpiresAt,
    scopes: tokens.scope ? tokens.scope.split(' ') : config.scopes,
  })

  const webOrigin = (process.env.WEB_ORIGIN ?? '').replace(/\/$/, '')
  return c.redirect(`${webOrigin}/onboarding`)
})
