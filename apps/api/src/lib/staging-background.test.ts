import { afterEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { stagingBackgroundGuard } from './staging-background'
import { enqueueJob } from './jobs'
afterEach(() => vi.unstubAllEnvs())
describe('stagingBackgroundGuard', () => {
  it('rejects direct queue submissions before database access', async () => {
    vi.stubEnv('RAILWAY_ENVIRONMENT_NAME', 'staging')
    vi.stubEnv('DATABASE_URL', '')
    await expect(enqueueJob('send', {})).rejects.toMatchObject({
      status: 503,
      code: 'staging_background_disabled',
    })
  })

  it('rejects a submission before creating work in staging', async () => {
    vi.stubEnv('RAILWAY_ENVIRONMENT_NAME', 'staging')
    let jobs = 0
    const app = new Hono().post('/submit', stagingBackgroundGuard, (c) => {
      jobs++
      return c.json({ accepted: true })
    })
    const result = await app.request('/submit', { method: 'POST' })
    expect(result.status).toBe(503)
    expect(await result.json()).toMatchObject({ code: 'staging_background_disabled' })
    expect(jobs).toBe(0)
  })
  it('preserves production acceptance', async () => {
    vi.stubEnv('RAILWAY_ENVIRONMENT_NAME', 'production')
    const app = new Hono().post('/submit', stagingBackgroundGuard, (c) =>
      c.json({ accepted: true }),
    )
    expect((await app.request('/submit', { method: 'POST' })).status).toBe(200)
  })
})
