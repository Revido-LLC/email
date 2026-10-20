import { backgroundWorkEnabled } from '@revido/core/staging-background'
import type { MiddlewareHandler } from 'hono'
import { HttpError } from './http'

export function assertBackgroundWorkEnabled() {
  if (!backgroundWorkEnabled())
    throw new HttpError(
      503,
      'staging_background_disabled',
      'Enable a coordinated staging background test session first.',
    )
}

export const stagingBackgroundGuard: MiddlewareHandler = async (c, next) => {
  if (!backgroundWorkEnabled())
    return c.json(
      {
        code: 'staging_background_disabled',
        error:
          'Background processing is disabled in staging. Enable a coordinated staging test session first.',
      },
      503,
    )
  await next()
}
