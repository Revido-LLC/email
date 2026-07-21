/**
 * `forward` consumer — execute a forwarding-rule action.
 *
 * A trusted forwarding rule (worker) or an approved forward (api) enqueues a
 * `forward` job with `run_at = now + 10s` (the same deferred/undo window as a
 * normal send). When it runs, the consumer decrypts the SOURCE inbound message +
 * its attachments and sends a fresh "Fwd:" message to the rule's destination via
 * the provider adapter — so the forward lands in the user's real Sent folder. It
 * is a new message, not a reply, so no threading header is set.
 */

import type { AccountContext } from '../db/accounts'
import type { AdapterFactory } from '../adapters'
import type { ProviderCredentials } from '@revido/core'
import type { ForwardStore } from '../mail/store'
import type { JobConsumer } from '../queue/runner'
import { forwardPayload } from '../queue/jobs'

export interface ForwardDeps {
  loadAccount(accountId: string): Promise<AccountContext>
  adapterFor: AdapterFactory
  mail: Pick<ForwardStore, 'getForwardSource'>
  saveCredentials(account: AccountContext, creds: ProviderCredentials): Promise<void>
}

export function makeForwardConsumer(deps: ForwardDeps): JobConsumer {
  return async (payload) => {
    const { accountId, sourceMessageId, to } = forwardPayload.parse(payload)
    const account = await deps.loadAccount(accountId)

    const src = await deps.mail.getForwardSource(account.userId, sourceMessageId, account.crypto)
    if (!src) return // source message withdrawn/deleted — nothing to forward.

    const adapter = deps.adapterFor(account.provider)
    const creds = await adapter.connect(account.creds)
    if (creds !== account.creds) await deps.saveCredentials(account, creds)

    const subject = src.subject.toLowerCase().startsWith('fwd:')
      ? src.subject
      : `Fwd: ${src.subject}`
    await adapter.send(creds, {
      to: [{ name: '', email: to }],
      subject,
      html: src.html,
      text: src.text,
      attachments: src.attachments,
    })
  }
}
