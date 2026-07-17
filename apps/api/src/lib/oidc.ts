/**
 * Google OIDC push-token verification for the Gmail Pub/Sub webhook.
 *
 * Gmail push delivers each notification with an `Authorization: Bearer <JWT>`
 * header — a Google-signed OIDC token whose `aud` is the push endpoint. We verify
 * it before trusting the envelope: structural validity, issuer, expiry, audience,
 * optional service-account email, and the RS256 signature against Google's rotating
 * public certs. Any failure raises an {@link HttpError} (401 for a
 * missing/malformed token, 403 for a token that fails a claim/signature check), so
 * a forged push is rejected rather than enqueued.
 */
import { createPublicKey, createVerify } from 'node:crypto'
import { HttpError } from './http'

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v1/certs'
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com'])

interface JwtParts {
  header: { alg?: string; kid?: string }
  payload: Record<string, unknown>
  signingInput: string
  signature: Buffer
}

function b64urlToBuffer(input: string): Buffer {
  return Buffer.from(input, 'base64url')
}

function decodeJwt(token: string): JwtParts {
  const segments = token.split('.')
  if (segments.length !== 3) throw new HttpError(401, 'invalid_token', 'Malformed JWT')
  const [headerB64, payloadB64, signatureB64] = segments as [string, string, string]
  try {
    const header = JSON.parse(b64urlToBuffer(headerB64).toString('utf8')) as JwtParts['header']
    const payload = JSON.parse(b64urlToBuffer(payloadB64).toString('utf8')) as Record<
      string,
      unknown
    >
    return {
      header,
      payload,
      signingInput: `${headerB64}.${payloadB64}`,
      signature: b64urlToBuffer(signatureB64),
    }
  } catch {
    throw new HttpError(401, 'invalid_token', 'Undecodable JWT')
  }
}

interface CertCache {
  certs: Record<string, string>
  expiresAt: number
}
let certCache: CertCache | undefined

/** Fetch (and cache) Google's `kid → x509 PEM` signing certs. */
async function googleCerts(
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, string>> {
  const now = Date.now()
  if (certCache && certCache.expiresAt > now) return certCache.certs
  const res = await fetchImpl(GOOGLE_CERTS_URL)
  if (!res.ok) throw new HttpError(503, 'certs_unavailable', 'Could not fetch Google certs')
  const certs = (await res.json()) as Record<string, string>
  // Honor Cache-Control max-age when present, else cache for an hour.
  const cacheControl = res.headers.get('cache-control') ?? ''
  const maxAge = /max-age=(\d+)/.exec(cacheControl)?.[1]
  const ttl = maxAge ? Number(maxAge) * 1000 : 3_600_000
  certCache = { certs, expiresAt: now + ttl }
  return certs
}

export interface VerifyOptions {
  /** Expected `aud` claim (the push endpoint URL). Skipped when unset. */
  audience?: string
  /** Expected `email` claim (the push service-account). Skipped when unset. */
  email?: string
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch
}

/**
 * Verify a Google OIDC push token, returning its claims. Throws {@link HttpError}
 * on any failure.
 */
export async function verifyGoogleOidcToken(
  token: string | undefined,
  options: VerifyOptions = {},
): Promise<Record<string, unknown>> {
  if (!token) throw new HttpError(401, 'missing_token', 'No bearer token')
  const { header, payload, signingInput, signature } = decodeJwt(token)

  const iss = typeof payload.iss === 'string' ? payload.iss : ''
  if (!GOOGLE_ISSUERS.has(iss)) throw new HttpError(403, 'bad_issuer')

  const exp = typeof payload.exp === 'number' ? payload.exp : 0
  if (exp * 1000 <= Date.now()) throw new HttpError(403, 'token_expired')

  if (options.audience && payload.aud !== options.audience) {
    throw new HttpError(403, 'bad_audience')
  }
  if (options.email && payload.email !== options.email) {
    throw new HttpError(403, 'bad_email')
  }

  if (header.alg !== 'RS256' || !header.kid) throw new HttpError(403, 'bad_alg')
  const certs = await googleCerts(options.fetchImpl)
  const pem = certs[header.kid]
  if (!pem) throw new HttpError(403, 'unknown_kid')

  const verifier = createVerify('RSA-SHA256')
  verifier.update(signingInput)
  verifier.end()
  const ok = verifier.verify(createPublicKey(pem), signature)
  if (!ok) throw new HttpError(403, 'bad_signature')

  return payload
}

/** Extract a bearer token from an `Authorization` header value. */
export function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match?.[1]
}
