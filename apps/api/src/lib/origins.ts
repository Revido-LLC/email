/**
 * Browser origins allowed to call the API with credentials and receive OAuth
 * callbacks. `WEB_ORIGIN` accepts a comma-separated list so production and
 * preview hosts can be configured without widening access to arbitrary origins.
 */
export function webOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.WEB_ORIGIN ?? '')
    .split(',')
    .map((value) => value.trim().replace(/\/+$/, ''))
    .filter(Boolean)
}
