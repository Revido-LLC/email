import { cors } from 'hono/cors'
import { createMiddleware } from 'hono/factory'
import { webOrigins } from '../lib/origins'

/** Restrict credentialed browser access to the explicitly configured Web app. */
export function apiCors(env: NodeJS.ProcessEnv = process.env) {
  const allowed = new Set(webOrigins(env))
  const configuredCors = cors({
    origin: (origin) => origin,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Length', 'Content-Type'],
    credentials: true,
    maxAge: 600,
  })

  return createMiddleware(async (c, next) => {
    const origin = c.req.header('origin')
    if (!origin || !allowed.has(origin.replace(/\/+$/, ''))) {
      return next()
    }
    return configuredCors(c, next)
  })
}
