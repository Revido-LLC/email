/**
 * @revido/worker — the background worker(s) (W4/W5/W6/W8/W9).
 *
 * Consumes Supabase Queues (pgmq): sync backfill, incremental sync, AI
 * enrichment, agent runs, reminder/digest generation, watch/subscription
 * renewals, deferred sends. Scheduled work is enqueued by pg_cron. Runs under
 * `infisical run` on a separate Railway service.
 *
 * This Wave 0 stub is the loop skeleton the Wave 2 `worker-service` and
 * `enrichment` agents build on.
 */

/** Registry of pgmq queue consumers; populated by the worker/enrichment agents. */
export const consumers: Record<string, (payload: unknown) => Promise<void>> = {}

async function main(): Promise<void> {
  console.log('[worker] started; consumers:', Object.keys(consumers).length)
  // The Wave 2 worker-service agent adds the pgmq poll loop here.
}

if (process.env.NODE_ENV !== 'test') {
  void main()
}
