import { afterEach, describe, expect, it } from 'vitest'
import type { Server } from 'node:http'
import { startStagingWorker } from './staging-worker'
const servers: Server[] = []
afterEach(async () => {
  for (const server of servers.splice(0))
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
})
describe('startStagingWorker', () => {
  it('does not initialize consumers or claim readiness while disabled', async () => {
    let imports = 0
    const server = await startStagingWorker(
      async () => {
        imports++
      },
      { RAILWAY_ENVIRONMENT_NAME: 'staging', PORT: '0' },
      [],
    )
    expect(imports).toBe(0)
    expect(server).toBeDefined()
    servers.push(server!)
    const address = server!.address() as { port: number }
    const url = `http://localhost:${address.port}`
    expect((await fetch(`${url}/health`)).status).toBe(200)
    const ready = await fetch(`${url}/ready`)
    expect(ready.status).toBe(503)
    expect(await ready.json()).toMatchObject({ status: 'background_disabled' })
    expect((await fetch(`${url}/unexpected`)).status).toBe(404)
  })
  it('retains normal startup in production and explicit staging tests', async () => {
    let starts = 0
    const load = async () => {
      starts++
    }
    expect(
      await startStagingWorker(load, { RAILWAY_ENVIRONMENT_NAME: 'production' }, []),
    ).toBeUndefined()
    expect(
      await startStagingWorker(load, { RAILWAY_ENVIRONMENT_NAME: 'staging' }, [
        '--staging-background',
      ]),
    ).toBeUndefined()
    expect(starts).toBe(2)
  })
})
