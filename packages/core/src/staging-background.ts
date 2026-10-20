import { isStagingEnvironment } from '@revido/db/railway-environment'

export type StagingEnvironment = {
  RAILWAY_ENVIRONMENT_ID?: string
  RAILWAY_ENVIRONMENT_NAME?: string
  PORT?: string
}

export function backgroundWorkEnabled(
  env: StagingEnvironment = process.env,
  args: readonly string[] = process.argv,
): boolean {
  return !isStagingEnvironment(env) || args.includes('--staging-background')
}
