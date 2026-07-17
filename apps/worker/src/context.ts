/**
 * WorkerContext — the assembled dependencies every consumer draws from.
 *
 * Consumers accept only the narrow slice they need (see each `make*Consumer`),
 * which keeps them unit-testable with fakes; `createWorkerContext` wires the real
 * Postgres store, job queue, KMS, Anthropic LLM client, and provider adapters.
 */

import { DevKmsProvider } from '@revido/db/crypto'
import type { KmsProvider } from '@revido/db/crypto'
import { createEmbeddingsClient, type EmbeddingsClient } from '@revido/core'
import { createAdapterFactory, type AdapterFactory } from './adapters'
import { createWorkerDb, type WorkerDb } from './db/client'
import {
  loadAccountContext,
  loadUserContext,
  type AccountContext,
  type UserContext,
} from './db/accounts'
import { createLlmClient, type WorkerLlmClient } from './llm'
import { ResendEmailSender, type EmailSender } from './mail/email'
import { PgMailStore } from './mail/pg-store'
import type { MailStore } from './mail/store'
import { PgJobStore } from './queue/store'
import type { JobStore } from './queue/store'
import { consoleLogger, type Logger } from './queue/runner'

export interface WorkerContext {
  db: WorkerDb
  jobs: JobStore
  llm: WorkerLlmClient
  embeddings: EmbeddingsClient
  mail: MailStore
  email: EmailSender
  adapterFor: AdapterFactory
  kms: KmsProvider
  /**
   * Route backfill's bulk historical triage through the Batches API (−50% cost).
   * Off (`ANTHROPIC_BATCHES_DISABLED`) falls back to per-message real-time triage.
   */
  batchTriage: boolean
  loadAccount(accountId: string): Promise<AccountContext>
  loadUser(userId: string): Promise<UserContext>
  now(): Date
  logger: Logger
}

/** Batches on unless `ANTHROPIC_BATCHES_DISABLED` is `1` / `true` (case-insensitive). */
export function isBatchTriageEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const disabled = env.ANTHROPIC_BATCHES_DISABLED
  return !(disabled === '1' || disabled?.toLowerCase() === 'true')
}

export function createWorkerContext(env: NodeJS.ProcessEnv = process.env): WorkerContext {
  const db = createWorkerDb(env)
  const kms = DevKmsProvider.fromEnv(env)
  return {
    db,
    jobs: new PgJobStore(db),
    llm: createLlmClient(env),
    embeddings: createEmbeddingsClient(env),
    mail: new PgMailStore(db),
    email: new ResendEmailSender(env),
    adapterFor: createAdapterFactory(env),
    kms,
    batchTriage: isBatchTriageEnabled(env),
    loadAccount: (accountId) => loadAccountContext(db, accountId, kms),
    loadUser: (userId) => loadUserContext(db, userId, kms),
    now: () => new Date(),
    logger: consoleLogger,
  }
}
