/**
 * The job runner — poll `jobs`, dispatch to the queue's consumer, then mark the
 * row done or failed (with exponential backoff up to `max_attempts`).
 *
 * `processNextJob` runs exactly one claim→dispatch→settle cycle and is the unit
 * of test. `runJobLoop` drives it until the shutdown `AbortSignal` fires, waiting
 * `pollIntervalMs` between empty polls. A job whose queue has no registered
 * consumer is failed straight to the dead-letter state (attempts forced to the
 * cap) rather than retried forever.
 *
 * `attempts` on a `ClaimedJob` is the count AFTER this claim (the store increments
 * it at claim time), so it is the number of the attempt about to run. A claim that
 * comes back already past `max_attempts` — a job that has been reclaimed after
 * repeatedly crashing the process — is dead-lettered without running the consumer.
 */

import type { ClaimedJob, JobStore } from './store'

/** A consumer handles one queue. It receives the raw payload + job metadata. */
export type JobConsumer = (payload: unknown, job: ClaimedJob) => Promise<void>
export type ConsumerRegistry = Record<string, JobConsumer>

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void
  error(msg: string, meta?: Record<string, unknown>): void
}

export const consoleLogger: Logger = {
  info: (msg, meta) => console.log(`[worker] ${msg}`, meta ?? ''),
  error: (msg, meta) => console.error(`[worker] ${msg}`, meta ?? ''),
}

export interface RunnerOptions {
  workerId: string
  pollIntervalMs: number
  /** Backoff (ms) before the next attempt, given the attempt count so far. */
  backoffMs?: (attempts: number) => number
  now?: () => Date
  logger?: Logger
}

const MINUTE = 60_000
const MAX_BACKOFF_MS = 60 * MINUTE

/** Exponential backoff: 5s, 10s, 20s, … capped at 1h. */
export function defaultBackoffMs(attempts: number): number {
  const base = 5_000 * 2 ** Math.max(0, attempts - 1)
  return Math.min(base, MAX_BACKOFF_MS)
}

/**
 * Claim and process a single job. Returns `true` if a job was processed,
 * `false` if the queue was empty.
 */
export async function processNextJob(
  store: JobStore,
  consumers: ConsumerRegistry,
  opts: RunnerOptions,
): Promise<boolean> {
  const now = opts.now ?? ((): Date => new Date())
  const backoffMs = opts.backoffMs ?? defaultBackoffMs
  const logger = opts.logger ?? consoleLogger

  const job = await store.claim(opts.workerId)
  if (!job) return false

  // `attempts` is already incremented at claim time — it's the current attempt no.
  const attempts = job.attempts

  // A job reclaimed after exhausting its attempts (e.g. it crashed the process
  // every run before it could settle) is dead-lettered rather than run again.
  if (attempts > job.maxAttempts) {
    logger.error('job exceeded max attempts; dead-lettering', {
      queue: job.queue,
      jobId: job.id,
      attempts,
      maxAttempts: job.maxAttempts,
    })
    await store.fail(job.id, {
      attempts,
      maxAttempts: job.maxAttempts,
      error: `exceeded max attempts (${job.maxAttempts})`,
      runAt: now(),
    })
    return true
  }

  const consumer = consumers[job.queue]
  if (!consumer) {
    logger.error('no consumer for queue; dead-lettering', { queue: job.queue, jobId: job.id })
    await store.fail(job.id, {
      attempts: job.maxAttempts,
      maxAttempts: job.maxAttempts,
      error: `no consumer registered for queue "${job.queue}"`,
      runAt: now(),
    })
    return true
  }

  try {
    await consumer(job.payload, job)
    await store.complete(job.id)
  } catch (err) {
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err)
    const runAt = new Date(now().getTime() + backoffMs(attempts))
    logger.error('job failed', {
      queue: job.queue,
      jobId: job.id,
      attempt: attempts,
      maxAttempts: job.maxAttempts,
      error: message,
    })
    await store.fail(job.id, {
      attempts,
      maxAttempts: job.maxAttempts,
      error: message,
      runAt,
    })
  }
  return true
}

/** Interruptible sleep that resolves early when the signal aborts. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      resolve()
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Drive the queue until `signal` aborts. Drains greedily (keeps claiming while
 * jobs are available), then waits `pollIntervalMs` on an empty poll. A claim
 * error is logged and backed off so a transient DB blip doesn't spin the loop.
 */
export async function runJobLoop(
  store: JobStore,
  consumers: ConsumerRegistry,
  opts: RunnerOptions & { signal: AbortSignal },
): Promise<void> {
  const logger = opts.logger ?? consoleLogger
  logger.info('job loop started', {
    workerId: opts.workerId,
    queues: Object.keys(consumers),
  })
  while (!opts.signal.aborted) {
    let processed = false
    try {
      processed = await processNextJob(store, consumers, opts)
    } catch (err) {
      logger.error('claim/dispatch error', {
        error: err instanceof Error ? err.message : String(err),
      })
      await sleep(opts.pollIntervalMs, opts.signal)
      continue
    }
    if (!processed) await sleep(opts.pollIntervalMs, opts.signal)
  }
  logger.info('job loop stopped', { workerId: opts.workerId })
}
