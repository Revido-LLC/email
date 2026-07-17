/**
 * Shared HTTP plumbing: a typed error, the JSON error handler, and a
 * validate-and-parse helper.
 *
 * Every protected router mounts {@link errorHandler} via `app.onError`, so a
 * thrown {@link HttpError} (or a Zod validation failure) turns into a consistent
 * `{ error, ... }` JSON body with the right status. Handlers therefore `throw`
 * instead of hand-rolling error responses, and reads use {@link notFound} for the
 * single-resource 404 the contract mandates (a missing thread/agent/account is a
 * 404, never a 200 with a null body).
 */
import type { Context, ErrorHandler } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ZodError, type ZodType } from 'zod'

/** An error carrying the HTTP status + a stable machine-readable `code`. */
export class HttpError extends Error {
  readonly status: ContentfulStatusCode
  readonly code: string

  constructor(status: ContentfulStatusCode, code: string, message?: string) {
    super(message ?? code)
    this.name = 'HttpError'
    this.status = status
    this.code = code
  }
}

/** The canonical 404 for a missing single resource. */
export function notFound(c: Context, code = 'not_found'): Response {
  return c.json({ error: code }, 404)
}

/** Maps thrown errors to the shared JSON error shape. Mounted per protected router. */
export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HttpError) {
    return c.json({ error: err.code, message: err.message }, err.status)
  }
  if (err instanceof ZodError) {
    return c.json({ error: 'invalid_request', issues: err.issues }, 400)
  }
  console.error('[api] unhandled error', err)
  return c.json({ error: 'internal_error' }, 500)
}

/**
 * Read + validate a JSON request body against a Zod schema, throwing a 400
 * {@link HttpError} on a malformed body or a schema mismatch.
 */
export async function readJson<T>(c: Context, schema: ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    raw = undefined
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_request', parsed.error.message)
  }
  return parsed.data
}
