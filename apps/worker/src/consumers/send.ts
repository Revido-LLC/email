/**
 * `send` consumer — the deferred-send / 10s-undo tail.
 *
 * api-service creates the outbound message row (encrypted) and enqueues this job
 * with `run_at = now + 10s`; cancellation is api-service DELETEing the still
 * `pending` row before it runs. When it does run, the consumer decrypts the
 * message + creds, sends via the core adapter (threading headers derived from the
 * parent inbound message), and records the returned provider message id.
 */

import type { AccountContext } from '../db/accounts'
import type { AdapterFactory } from '../adapters'
import type { ProviderCredentials } from '@revido/core'
import type { SendStore } from '../mail/store'
import type { JobConsumer } from '../queue/runner'
import { sendPayload } from '../queue/jobs'

export interface SendDeps {
  loadAccount(accountId: string): Promise<AccountContext>
  adapterFor: AdapterFactory
  mail: Pick<SendStore, 'getOutboundMessage' | 'markSent'>
  saveCredentials(account: AccountContext, creds: ProviderCredentials): Promise<void>
}

export function makeSendConsumer(deps: SendDeps): JobConsumer {
  return async (payload) => {
    const { accountId, messageId } = sendPayload.parse(payload)
    const account = await deps.loadAccount(accountId)

    const outbound = await deps.mail.getOutboundMessage(account.userId, messageId, account.crypto)
    if (!outbound) return // message was withdrawn — nothing to send.

    const adapter = deps.adapterFor(account.provider)
    const creds = await adapter.connect(account.creds)
    if (creds !== account.creds) await deps.saveCredentials(account, creds)

    const sent = await adapter.send(creds, {
      to: outbound.to,
      cc: outbound.cc,
      bcc: outbound.bcc,
      subject: outbound.subject,
      html: outbound.html,
      text: outbound.text,
      inReplyToProviderMessageId: outbound.inReplyToProviderMessageId,
    })
    await deps.mail.markSent(account.userId, messageId, sent.providerMessageId)
  }
}
