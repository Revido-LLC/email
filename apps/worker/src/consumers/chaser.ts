/**
 * `chaser` consumer — send a pre-drafted follow-up for a reminder.
 *
 * Enrichment pre-drafts a polite chaser onto `reminders.draft_reply_ct` for
 * sent-mail-awaiting-reply. When the user confirms it, api-service enqueues this
 * job. The consumer decrypts the draft, resolves the account + recipients from
 * the thread (the people we last emailed and are now chasing), sends via the
 * provider adapter (threaded onto the original message), and resolves the
 * reminder by deleting it. A withdrawn reminder (deleted before the job ran) or
 * one with no draft/recipients is a no-op.
 */

import type { ProviderCredentials } from '@revido/core'
import type { AccountContext } from '../db/accounts'
import type { AdapterFactory } from '../adapters'
import type { ChaserStore, UsageStore } from '../mail/store'
import type { JobConsumer } from '../queue/runner'
import { chaserPayload } from '../queue/jobs'

export interface ChaserDeps {
  loadAccount(accountId: string): Promise<AccountContext>
  loadUserCrypto(userId: string): Promise<{ userId: string; crypto: AccountContext['crypto'] }>
  adapterFor: AdapterFactory
  mail: Pick<ChaserStore, 'getChaserSendData' | 'deleteReminder'> & Pick<UsageStore, 'increment'>
  saveCredentials(account: AccountContext, creds: ProviderCredentials): Promise<void>
}

export function makeChaserConsumer(deps: ChaserDeps): JobConsumer {
  return async (payload) => {
    const { userId, reminderId } = chaserPayload.parse(payload)

    const user = await deps.loadUserCrypto(userId)
    const data = await deps.mail.getChaserSendData(userId, reminderId, user.crypto)
    if (!data) return // reminder withdrawn / no draft / no recipient — nothing to send.

    const account = await deps.loadAccount(data.accountId)
    const adapter = deps.adapterFor(account.provider)
    const creds = await adapter.connect(account.creds)
    if (creds !== account.creds) await deps.saveCredentials(account, creds)

    await adapter.send(creds, {
      to: data.to,
      subject: data.subject,
      html: data.html,
      text: data.text,
      inReplyToProviderMessageId: data.inReplyToProviderMessageId,
    })

    await deps.mail.deleteReminder(userId, reminderId)
    await deps.mail.increment(userId, 'chasers_sent')
  }
}
