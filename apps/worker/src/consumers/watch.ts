/**
 * `renew_watch` + `reconcile` consumers.
 *
 * `renew_watch` (re-)registers provider push notifications through the core
 * adapter and seeds the incremental cursor from the returned watch registration
 * — Gmail's `users.watch` (7-day expiry) is idempotent on renewal; Graph
 * subscriptions (~3-day expiry) re-register. `reconcile` is the missed-push
 * safety net: it simply enqueues an `incremental` sweep so any delta the push
 * channel dropped is still applied.
 */

import type { AccountContext } from '../db/accounts'
import type { AdapterFactory } from '../adapters'
import type { ProviderCredentials } from '@revido/core'
import type { SyncStore } from '../mail/store'
import type { JobStore } from '../queue/store'
import type { JobConsumer } from '../queue/runner'
import {
  QUEUE,
  reconcilePayload,
  renewWatchPayload,
  type IncrementalPayload,
} from '../queue/jobs'

export interface RenewWatchDeps {
  loadAccount(accountId: string): Promise<AccountContext>
  adapterFor: AdapterFactory
  mail: Pick<SyncStore, 'saveCursor'>
  saveCredentials(account: AccountContext, creds: ProviderCredentials): Promise<void>
}

export function makeRenewWatchConsumer(deps: RenewWatchDeps): JobConsumer {
  return async (payload) => {
    const { accountId } = renewWatchPayload.parse(payload)
    const account = await deps.loadAccount(accountId)
    const adapter = deps.adapterFor(account.provider)

    const creds = await adapter.connect(account.creds)
    if (creds !== account.creds) await deps.saveCredentials(account, creds)

    const watch = await adapter.watch(creds)
    await deps.mail.saveCursor({
      accountId,
      userId: account.userId,
      historyId: account.provider === 'gmail' ? watch.cursor : undefined,
      deltaLink: account.provider === 'outlook' ? watch.cursor : undefined,
      // Persist the subscription id so a webhook push (no account id) resolves back here.
      subscriptionId: watch.id,
    })
  }
}

export interface ReconcileDeps {
  jobs: Pick<JobStore, 'enqueue'>
}

export function makeReconcileConsumer(deps: ReconcileDeps): JobConsumer {
  return async (payload) => {
    const { accountId } = reconcilePayload.parse(payload)
    const job: IncrementalPayload = { accountId }
    await deps.jobs.enqueue(QUEUE.incremental, job)
  }
}
