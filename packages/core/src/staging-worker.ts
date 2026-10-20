import { createServer } from 'node:http'
import { backgroundWorkEnabled, type StagingEnvironment } from './staging-background.js'

export async function startStagingWorker(
  loadConsumers: () => Promise<unknown>,
  env: StagingEnvironment = process.env,
  args: readonly string[] = process.argv,
) {
  if (backgroundWorkEnabled(env, args)) {
    await loadConsumers()
    return
  }
  const server = createServer((request, response) => {
    const path = request.url?.split('?')[0]
    const status = path === '/health' || path === '/live' ? 200 : path === '/ready' ? 503 : 404
    response.writeHead(status, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ status: status === 404 ? 'not_found' : 'background_disabled' }))
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(Number(env.PORT ?? 8080), '::', resolve)
  })
  return server
}
