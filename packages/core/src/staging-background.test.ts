import { describe, expect, it } from 'vitest'
import { backgroundWorkEnabled } from './staging-background'

describe('backgroundWorkEnabled', () => {
  it('disables the proven staging identity without an explicit opt-in', () => {
    expect(
      backgroundWorkEnabled({ RAILWAY_ENVIRONMENT_ID: 'f747e030-3070-4c93-b1b1-9982b28bd171' }, []),
    ).toBe(false)
    expect(backgroundWorkEnabled({ RAILWAY_ENVIRONMENT_NAME: 'staging' }, [])).toBe(false)
  })
  it('keeps recognized PR workers disabled without affecting custom production names', () => {
    expect(backgroundWorkEnabled({ RAILWAY_ENVIRONMENT_NAME: 'prerje-pr-164' }, [])).toBe(false)
    expect(backgroundWorkEnabled({ RAILWAY_ENVIRONMENT_NAME: 'email-pr-5' }, [])).toBe(false)
    expect(backgroundWorkEnabled({ RAILWAY_ENVIRONMENT_NAME: 'my-production' }, [])).toBe(true)
  })

  it('allows explicit staging tests', () => {
    expect(
      backgroundWorkEnabled({ RAILWAY_ENVIRONMENT_NAME: 'staging' }, ['--staging-background']),
    ).toBe(true)
  })
  it('preserves production and local processing', () => {
    expect(backgroundWorkEnabled({ RAILWAY_ENVIRONMENT_NAME: 'production' }, [])).toBe(true)
    expect(backgroundWorkEnabled({}, [])).toBe(true)
  })
})
