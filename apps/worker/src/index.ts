/**
 * @revido/worker — the background worker (W4/W5/W6/W8/W9).
 *
 * Drains the `jobs` queue (Railway Postgres): sync backfill/incremental, deferred
 * sends, AI enrichment (triage/summary), watch renewals, reconcile sweeps, and
 * digest generation. Periodic work is ENQUEUED by an in-process node-cron
 * scheduler; api-service enqueues `backfill`, `incremental`, and `send`. Runs on a
 * separate Railway service.
 *
 * `main()` wires the {@link createWorkerContext} dependencies, registers the
 * consumers, starts the scheduler + poll loop, and shuts down gracefully on
 * SIGTERM/SIGINT (aborting new claims; the in-flight job finishes first).
 */

import { buildConsumers } from './consumers'
import { createWorkerContext } from './context'
import { runJobLoop } from './queue/runner'
import { PgScheduleRepo, startScheduler } from './scheduler'

const DEFAULT_POLL_INTERVAL_MS = 1_000

export async function main(): Promise<void> {
  const ctx = createWorkerContext()
  const consumers = buildConsumers(ctx)
  const controller = new AbortController()

  const workerId = process.env.WORKER_ID ?? `worker-${process.pid}`
  const pollIntervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS)

  const scheduler = startScheduler({
    jobs: ctx.jobs,
    schedule: new PgScheduleRepo(ctx.db),
    logger: ctx.logger,
  })

  let shuttingDown = false
  const shutdown = (signal: string): void => {
    if (shuttingDown) return
    shuttingDown = true
    ctx.logger.info('shutdown signal received; draining', { signal })
    controller.abort()
    scheduler.stop()
  }
  process.once('SIGTERM', () => shutdown('SIGTERM'))
  process.once('SIGINT', () => shutdown('SIGINT'))

  await runJobLoop(ctx.jobs, consumers, {
    workerId,
    pollIntervalMs,
    signal: controller.signal,
    logger: ctx.logger,
  })

  await ctx.db.close()
}

if (process.env.NODE_ENV !== 'test') {
  void main()
}
