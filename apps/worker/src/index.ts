import { startStagingWorker } from '@revido/core/staging-worker'

if (process.env.NODE_ENV !== 'test') {
  const idleServer = await startStagingWorker(() => import('./background-main'))
  if (idleServer) {
    console.log('Staging background processing disabled; no queue consumers started')
    for (const signal of ['SIGTERM', 'SIGINT'])
      process.once(signal, () => {
        idleServer.close(() => process.exit(0))
      })
  }
}
