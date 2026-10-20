export type StagingEnvironment = {
  RAILWAY_ENVIRONMENT_ID?: string
  RAILWAY_ENVIRONMENT_NAME?: string
  PORT?: string
}

export function backgroundWorkEnabled(
  env: StagingEnvironment = process.env,
  args: readonly string[] = process.argv,
): boolean {
  if (env.RAILWAY_ENVIRONMENT_NAME === 'production') return true
  const staging =
    env.RAILWAY_ENVIRONMENT_NAME === 'staging' ||
    /(?:^|-)pr-\d+$/.test(env.RAILWAY_ENVIRONMENT_NAME ?? '') ||
    env.RAILWAY_ENVIRONMENT_ID === 'f747e030-3070-4c93-b1b1-9982b28bd171'
  return !staging || args.includes('--staging-background')
}
