/**
 * `digest` consumer — build + deliver the daily digest.
 *
 * The scheduler enqueues one `digest` job per user each morning. This consumer
 * gathers the day's inbox shape (unread bundles by category, follow-ups the user
 * owes, open commitments, agent activity — all decrypted under the user DEK),
 * renders the bilingual `@react-email` template to HTML, and sends it via the
 * injected {@link EmailSender} (Resend in production). A quiet inbox produces no
 * email: the digest exists to reduce noise, not add another notification. Delivery
 * is metered under `digests`.
 */

import { render } from '@react-email/render'
import type { OutputLanguage } from '@revido/db'
import type { UserContext } from '../db/accounts'
import type { EmailSender } from '../mail/email'
import type { DigestData, DigestStore, UsageStore } from '../mail/store'
import type { JobConsumer } from '../queue/runner'
import { digestPayload } from '../queue/jobs'
import {
  DigestEmail,
  type DigestEmailProps,
  type DigestLocale,
  type ShortlistItem,
} from './digest-email'

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

function subjectFor(locale: DigestLocale, count: number): string {
  if (locale === 'nl')
    return count === 1 ? '1 prioriteit voor vandaag' : `${count} prioriteiten voor vandaag`
  return count === 1 ? '1 priority for today' : `${count} priorities for today`
}

const DIGEST_APP_URL = 'https://email.revido.co/app'

function shorten(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`
}

function digestShortlist(data: DigestData): {
  items: ShortlistItem[]
  hiddenCount: number
} {
  const replyBundle = data.bundles.find((bundle) => bundle.category === 'to-reply')
  const replies: ShortlistItem[] = (replyBundle?.items ?? []).slice(0, 3).map((item) => ({
    kind: 'reply',
    title: shorten(item.subject, 76),
    detail: shorten(item.sender, 48),
  }))

  const due: ShortlistItem[] = [
    ...data.reminders.map((item) => ({
      kind: 'due' as const,
      title: shorten(item.subject, 76),
      detail: shorten(item.sender, 48),
      dueAt: item.dueAt,
    })),
    ...data.commitments.map((item) => ({
      kind: 'due' as const,
      title: shorten(item.text, 88),
      detail: shorten(item.counterpart, 48),
      dueAt: item.dueAt,
    })),
  ]
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, 2)

  const totalUnread = data.bundles.reduce((sum, bundle) => sum + bundle.count, 0)
  return { items: [...replies, ...due], hiddenCount: Math.max(0, totalUnread - replies.length) }
}

function emailProps(data: DigestData, date: string): DigestEmailProps {
  const { items, hiddenCount } = digestShortlist(data)
  return {
    locale: localeFor(data.outputLanguage),
    date,
    items,
    hiddenCount,
    agentsHandled: data.agentsHandled,
    appUrl: DIGEST_APP_URL,
  }
}

/** Render the digest email to HTML (exported for testing without a live Resend). */
export async function renderDigest(data: DigestData, date: string): Promise<string> {
  return render(DigestEmail(emailProps(data, date)))
}

/** Plain-text alternative for clients that block HTML. */
export function renderDigestText(data: DigestData, date: string): string {
  const props = emailProps(data, date)
  const locale = props.locale
  const heading = subjectFor(locale, props.items.length)
  const labels =
    locale === 'nl'
      ? { reply: 'ANTWOORD', due: 'DEADLINE', more: 'De rest blijft in Revido.' }
      : { reply: 'REPLY', due: 'DUE', more: 'The rest stays in Revido.' }
  const lines = props.items.map((item) => {
    const label = item.kind === 'reply' ? labels.reply : labels.due
    return `${label}: ${item.title}${item.detail ? ` — ${item.detail}` : ''}`
  })
  if (props.hiddenCount > 0) lines.push(`${labels.more} · ${DIGEST_APP_URL}`)
  return [heading, date, '', ...lines, '', DIGEST_APP_URL].join('\n')
}

export function makeDigestConsumer(deps: DigestDeps): JobConsumer {
  const now = deps.now ?? ((): Date => new Date())
  return async (payload) => {
    const { userId } = digestPayload.parse(payload)
    const user = await deps.loadUser(userId)

    const data = await deps.mail.getDigestData(userId, user.crypto)
    if (!data.email) return // no delivery address on file — nothing to send.

    const date = now().toISOString().slice(0, 10)
    const props = emailProps(data, date)
    if (props.items.length === 0) return // A quiet inbox does not need another email.
    const html = await renderDigest(data, date)
    const text = renderDigestText(data, date)
    const locale = localeFor(data.outputLanguage)

    await deps.email.send({
      to: data.email,
      subject: subjectFor(locale, props.items.length),
      html,
      text,
    })
    await deps.mail.increment(userId, 'digests')
  }
}
