/**
 * WorkerContext — the assembled dependencies every consumer draws from.
 *
 * Consumers accept only the narrow slice they need (see each `make*Consumer`),
 * which keeps them unit-testable with fakes; `createWorkerContext` wires the real
 * Postgres store, job queue, KMS, Anthropic LLM client, and provider adapters.
 */

import { DevKmsProvider } from '@revido/db/crypto'
import type { KmsProvider } from '@revido/db/crypto'
import { createAdapterFactory, type AdapterFactory } from './adapters'
import { createWorkerDb, type WorkerDb } from './db/client'
import { loadAccountContext, type AccountContext } from './db/accounts'
import { createLlmClient, type WorkerLlmClient } from './llm'
import { PgMailStore } from './mail/pg-store'
import type { MailStore } from './mail/store'
import { PgJobStore } from './queue/store'
import type { JobStore } from './queue/store'
import { consoleLogger, type Logger } from './queue/runner'

export interface WorkerContext {
  db: WorkerDb
  jobs: JobStore
  llm: WorkerLlmClient
  mail: MailStore
  adapterFor: AdapterFactory
  kms: KmsProvider
  loadAccount(accountId: string): Promise<AccountContext>
  now(): Date
  logger: Logger
}

export function createWorkerContext(env: NodeJS.ProcessEnv = process.env): WorkerContext {
  const db = createWorkerDb(env)
  const kms = DevKmsProvider.fromEnv(env)
  return {
    db,
    jobs: new PgJobStore(db),
    llm: createLlmClient(env),
    mail: new PgMailStore(db),
    adapterFor: createAdapterFactory(env),
    kms,
    loadAccount: (accountId) => loadAccountContext(db, accountId, kms),
    now: () => new Date(),
    logger: consoleLogger,
  }
}
