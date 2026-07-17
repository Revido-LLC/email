/**
 * Assemble the queue → consumer registry from a {@link WorkerContext}.
 *
 * Each consumer is built from the narrow slice of the context it needs, so the
 * registry is the single wiring point between the queue names (the api-service
 * contract) and their handlers.
 */

import type { ProviderCredentials } from '@revido/core'
import { saveCredentials, type AccountContext } from '../db/accounts'
import type { WorkerContext } from '../context'
import type { ConsumerRegistry } from '../queue/runner'
import { QUEUE } from '../queue/jobs'
import { makeBackfillConsumer } from './backfill'
import { makeIncrementalConsumer } from './incremental'
import { makeSendConsumer } from './send'
import { makeTriageConsumer } from './triage'
import { makeSummaryConsumer } from './enrich'
import { makeReconcileConsumer, makeRenewWatchConsumer } from './watch'
import { makeDigestConsumer } from './digest'
import { makeEmbedConsumer } from './embed'
import { makeVoiceProfileConsumer } from './voice-profile'
import { makeAgentRunConsumer } from './agent-run'
import { makeChaserConsumer } from './chaser'

export function buildConsumers(ctx: WorkerContext): ConsumerRegistry {
  const saveCreds = (account: AccountContext, creds: ProviderCredentials): Promise<void> =>
    saveCredentials(ctx.db, account, creds)

  const syncDeps = {
    loadAccount: ctx.loadAccount,
    adapterFor: ctx.adapterFor,
    mail: ctx.mail,
    jobs: ctx.jobs,
    saveCredentials: saveCreds,
  }

  return {
    [QUEUE.backfill]: makeBackfillConsumer(syncDeps),
    [QUEUE.incremental]: makeIncrementalConsumer({ ...syncDeps, logger: ctx.logger }),
    [QUEUE.send]: makeSendConsumer({
      loadAccount: ctx.loadAccount,
      adapterFor: ctx.adapterFor,
      mail: ctx.mail,
      saveCredentials: saveCreds,
    }),
    [QUEUE.triage]: makeTriageConsumer({
      loadAccount: ctx.loadAccount,
      mail: ctx.mail,
      llm: ctx.llm,
    }),
    [QUEUE.summary]: makeSummaryConsumer({
      loadAccount: ctx.loadAccount,
      mail: ctx.mail,
      llm: ctx.llm,
    }),
    [QUEUE.embed]: makeEmbedConsumer({
      loadAccount: ctx.loadAccount,
      mail: ctx.mail,
      embeddings: ctx.embeddings,
    }),
    [QUEUE.voiceProfile]: makeVoiceProfileConsumer({
      loadUser: ctx.loadUser,
      mail: ctx.mail,
      llm: ctx.llm,
    }),
    [QUEUE.agentRun]: makeAgentRunConsumer({
      loadUser: ctx.loadUser,
      mail: ctx.mail,
      llm: ctx.llm,
    }),
    [QUEUE.chaser]: makeChaserConsumer({
      loadAccount: ctx.loadAccount,
      loadUserCrypto: ctx.loadUser,
      adapterFor: ctx.adapterFor,
      mail: ctx.mail,
      saveCredentials: saveCreds,
    }),
    [QUEUE.renewWatch]: makeRenewWatchConsumer({
      loadAccount: ctx.loadAccount,
      adapterFor: ctx.adapterFor,
      mail: ctx.mail,
      saveCredentials: saveCreds,
    }),
    [QUEUE.reconcile]: makeReconcileConsumer({ jobs: ctx.jobs }),
    [QUEUE.digest]: makeDigestConsumer({
      loadUser: ctx.loadUser,
      mail: ctx.mail,
      email: ctx.email,
    }),
  }
}
