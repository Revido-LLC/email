/**
 * `digest` consumer — daily digest generation endpoint.
 *
 * The scheduler enqueues one `digest` job per user each morning. Rendering the
 * digest email (`@react-email`) and delivering it (Resend) is a Wave-3 surface;
 * this consumer is the queue endpoint that work lands on. It currently records
 * the request — generation is deferred.
 */

import type { Logger } from '../queue/runner'
import type { JobConsumer } from '../queue/runner'
import { digestPayload } from '../queue/jobs'

export interface DigestDeps {
  logger: Logger
}

export function makeDigestConsumer(deps: DigestDeps): JobConsumer {
  return async (payload) => {
    const { userId } = digestPayload.parse(payload)
    deps.logger.info('digest requested (generation deferred)', { userId })
  }
}
