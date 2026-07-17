/**
 * `digest` consumer — build + deliver the daily digest.
 *
 * The scheduler enqueues one `digest` job per user each morning. This consumer
 * gathers the day's inbox shape (unread bundles by category, follow-ups the user
 * owes, open commitments, agent activity — all decrypted under the user DEK),
 * renders the bilingual `@react-email` template to HTML, and sends it via the
 * injected {@link EmailSender} (Resend in production). A user with no email or an
 * entirely empty digest still gets a short "nothing pressing" note, so the cadence
 * stays predictable. Delivery is metered under `digests`.
 */

import { render } from '@react-email/render'
import type { OutputLanguage } from '@revido/db'
import type { UserContext } from '../db/accounts'
import type { EmailSender } from '../mail/email'
import type { DigestData, DigestStore, UsageStore } from '../mail/store'
import type { JobConsumer } from '../queue/runner'
import { digestPayload } from '../queue/jobs'
import { DigestEmail, type DigestLocale } from './digest-email'

export interface DigestDeps {
  loadUser(userId: string): Promise<UserContext>
  mail: Pick<DigestStore, 'getDigestData'> & Pick<UsageStore, 'increment'>
  email: EmailSender
  now?(): Date
}

/** Map the user's output-language preference to a template locale (default EN). */
function localeFor(pref: OutputLanguage): DigestLocale {
  return pref === 'nl' ? 'nl' : 'en'
}

function subjectFor(locale: DigestLocale, date: string): string {
  return locale === 'nl' ? `Je dagelijkse overzicht — ${date}` : `Your daily digest — ${date}`
}

/** Render the digest email to HTML (exported for testing without a live Resend). */
export async function renderDigest(data: DigestData, date: string): Promise<string> {
  const locale = localeFor(data.outputLanguage)
  return render(
    DigestEmail({
      locale,
      name: data.name,
      date,
      bundles: data.bundles,
      reminders: data.reminders.map((r) => ({ subject: r.subject, sender: r.sender })),
      commitments: data.commitments.map((c) => ({ text: c.text, counterpart: c.counterpart })),
      agentsHandled: data.agentsHandled,
    }),
  )
}

export function makeDigestConsumer(deps: DigestDeps): JobConsumer {
  const now = deps.now ?? ((): Date => new Date())
  return async (payload) => {
    const { userId } = digestPayload.parse(payload)
    const user = await deps.loadUser(userId)

    const data = await deps.mail.getDigestData(userId, user.crypto)
    if (!data.email) return // no delivery address on file — nothing to send.

    const date = now().toISOString().slice(0, 10)
    const html = await renderDigest(data, date)
    const locale = localeFor(data.outputLanguage)

    await deps.email.send({
      to: data.email,
      subject: subjectFor(locale, date),
      html,
    })
    await deps.mail.increment(userId, 'digests')
  }
}
