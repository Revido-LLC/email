/**
 * A tiny in-memory, per-IP fixed-window rate limiter.
 *
 * Mounted on the unauthenticated edges — the OAuth start/callback and the
 * provider webhooks — where there is no session to key on, so a hostile caller
 * can't flood token exchanges or push ingestion. Single-instance only (state lives
 * in a `Map`); a distributed limiter (Redis/Postgres) is a later hardening step,
 * but this bounds abuse per API process today.
 */
import { createMiddleware } from 'hono/factory'
import type { Context } from 'hono'

interface Window {
  count: number
  resetAt: number
}

/** Best-effort client IP: the first `x-forwarded-for` hop (Railway sets it). */
function clientIp(c: Context): string {
  const fwd = c.req.header('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0]?.trim()
    if (first) return first
  }
  return c.req.header('x-real-ip') ?? 'unknown'
}

export interface RateLimitOptions {
  /** Window length in milliseconds. */
  windowMs: number
  /** Max requests allowed per IP per window. */
  max: number
}

/** Build a fixed-window limiter middleware. */
export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max } = options
  const windows = new Map<string, Window>()

  return createMiddleware(async (c, next) => {
    const now = Date.now()
    const ip = clientIp(c)
    const existing = windows.get(ip)

    if (!existing || existing.resetAt <= now) {
      windows.set(ip, { count: 1, resetAt: now + windowMs })
    } else {
      existing.count += 1
      if (existing.count > max) {
        const retryAfter = Math.ceil((existing.resetAt - now) / 1000)
        c.header('Retry-After', String(retryAfter))
        return c.json({ error: 'rate_limited' }, 429)
      }
    }

    // Opportunistic prune so the map can't grow without bound.
    if (windows.size > 10_000) {
      for (const [key, win] of windows) {
        if (win.resetAt <= now) windows.delete(key)
      }
    }

    await next()
  })
}
