export type RailwayEnvironment = {
  RAILWAY_ENVIRONMENT_ID?: string
  RAILWAY_ENVIRONMENT_NAME?: string
}

/** Only known staging/PR identities opt into nonproduction runtime policies. */
export function isStagingEnvironment(env: RailwayEnvironment): boolean {
  if (env.RAILWAY_ENVIRONMENT_NAME === 'production') return false
  return (
    env.RAILWAY_ENVIRONMENT_NAME === 'staging' ||
    /(?:^|-)pr-\d+$/.test(env.RAILWAY_ENVIRONMENT_NAME ?? '') ||
    env.RAILWAY_ENVIRONMENT_ID === 'f747e030-3070-4c93-b1b1-9982b28bd171'
  )
}
