/**
 * Transactional email sender — the narrow port the `digest` consumer sends
 * through, plus a Resend-backed implementation.
 *
 * Digests are OUR outbound product email (not a reply through the user's
 * mailbox), so they go via Resend rather than a provider adapter. Consumers
 * depend on {@link EmailSender} (not the SDK) so they stay unit-testable with a
 * fake; `ResendEmailSender` wraps `resend` and reads `RESEND_API_KEY`.
 */

import { Resend } from 'resend'

export interface OutgoingEmail {
  to: string
  subject: string
  html: string
  /** Plain-text alternative (accessibility + deliverability). */
  text?: string
}

export interface EmailSender {
  send(email: OutgoingEmail): Promise<void>
}

/** Resend-backed sender. `from` defaults to `DIGEST_FROM` (or a Revido default). */
export class ResendEmailSender implements EmailSender {
  private readonly resend: Resend
  private readonly from: string

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const apiKey = env.RESEND_API_KEY
    if (!apiKey) throw new Error('RESEND_API_KEY is not set')
    this.resend = new Resend(apiKey)
    this.from = env.DIGEST_FROM ?? 'Revido Mail <digest@revido.co>'
  }

  async send(email: OutgoingEmail): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text ?? '',
    })
    if (error) throw new Error(`Resend send failed: ${error.name}: ${error.message}`)
  }
}
