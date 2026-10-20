import { describe, expect, it } from 'vitest'
import { isStagingEnvironment } from './railway-environment'

describe('isStagingEnvironment', () => {
  it('recognizes staging and PR names and the known staging ID', () => {
    expect(isStagingEnvironment({ RAILWAY_ENVIRONMENT_NAME: 'staging' })).toBe(true)
    expect(isStagingEnvironment({ RAILWAY_ENVIRONMENT_NAME: 'email-pr-2' })).toBe(true)
    expect(isStagingEnvironment({ RAILWAY_ENVIRONMENT_NAME: 'pr-2' })).toBe(true)
    expect(
      isStagingEnvironment({ RAILWAY_ENVIRONMENT_ID: 'f747e030-3070-4c93-b1b1-9982b28bd171' }),
    ).toBe(true)
  })

  it('preserves production even if a stale staging ID is present', () => {
    expect(
      isStagingEnvironment({
        RAILWAY_ENVIRONMENT_NAME: 'production',
        RAILWAY_ENVIRONMENT_ID: 'f747e030-3070-4c93-b1b1-9982b28bd171',
      }),
    ).toBe(false)
  })

  it('does not guess that local or custom names are staging', () => {
    expect(isStagingEnvironment({})).toBe(false)
    expect(isStagingEnvironment({ RAILWAY_ENVIRONMENT_NAME: 'my-production' })).toBe(false)
    expect(isStagingEnvironment({ RAILWAY_ENVIRONMENT_NAME: 'email-pr-2-other' })).toBe(false)
  })
})
