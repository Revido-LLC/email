/**
 * The daily-digest email template (`@react-email`), bilingual EN/NL.
 *
 * A pure presentational component rendered to HTML by the `digest` consumer and
 * sent via Resend. It receives already-decrypted, plain display data (no
 * ciphertext, no db types) so it stays a dumb view. Copy is selected by `locale`
 * ('en' | 'nl'); category labels come from {@link CATEGORY_LABELS}.
 */

import { Body, Container, Head, Heading, Hr, Html, Section, Text } from '@react-email/components'
import type { ReactElement } from 'react'
import type { CategoryId, DigestBundle } from '@revido/db'

export type DigestLocale = 'en' | 'nl'

export interface DigestEmailProps {
  locale: DigestLocale
  name: string | null
  date: string
  bundles: DigestBundle[]
  reminders: { subject: string; sender: string }[]
  commitments: { text: string; counterpart: string }[]
  agentsHandled: number
}

const COPY: Record<DigestLocale, Record<string, string>> = {
  en: {
    preview: 'Your daily inbox digest',
    greeting: 'Good morning',
    intro: "Here's what's waiting in your inbox today.",
    needYou: 'Needs you',
    promises: 'Your open commitments',
    agents: 'handled automatically by your agents',
    nothing: 'Nothing pressing — enjoy the quiet.',
    unreadSuffix: 'unread',
  },
  nl: {
    preview: 'Je dagelijkse inbox-overzicht',
    greeting: 'Goedemorgen',
    intro: 'Dit staat er vandaag klaar in je inbox.',
    needYou: 'Vraagt om jou',
    promises: 'Je openstaande toezeggingen',
    agents: 'automatisch afgehandeld door je agents',
    nothing: 'Niets dringends — geniet van de rust.',
    unreadSuffix: 'ongelezen',
  },
}

const CATEGORY_LABELS: Record<DigestLocale, Record<CategoryId, string>> = {
  en: {
    'to-reply': 'To reply',
    'awaiting-reply': 'Awaiting reply',
    fyi: 'FYI',
    newsletters: 'Newsletters',
    notifications: 'Notifications',
    promotions: 'Promotions',
    receipts: 'Receipts',
    calendar: 'Calendar',
    personal: 'Personal',
  },
  nl: {
    'to-reply': 'Beantwoorden',
    'awaiting-reply': 'Wacht op antwoord',
    fyi: 'Ter info',
    newsletters: 'Nieuwsbrieven',
    notifications: 'Meldingen',
    promotions: 'Aanbiedingen',
    receipts: 'Bonnen',
    calendar: 'Agenda',
    personal: 'Persoonlijk',
  },
}

const styles = {
  body: { backgroundColor: '#faf9f7', fontFamily: 'Helvetica, Arial, sans-serif', color: '#1c1917' },
  container: { margin: '0 auto', padding: '24px', maxWidth: '560px' },
  h1: { fontSize: '22px', fontWeight: 600, margin: '0 0 4px' },
  intro: { fontSize: '14px', color: '#57534e', margin: '0 0 20px' },
  h2: { fontSize: '13px', fontWeight: 600, textTransform: 'uppercase' as const, color: '#78716c', margin: '20px 0 8px' },
  bundle: { fontSize: '14px', margin: '0 0 6px' },
  count: { color: '#a8a29e' },
  item: { fontSize: '13px', color: '#44403c', margin: '2px 0' },
  agents: { fontSize: '13px', color: '#57534e', marginTop: '16px' },
}

/** The digest email as a react-email component tree. */
export function DigestEmail(props: DigestEmailProps): ReactElement {
  const t = COPY[props.locale]
  const labels = CATEGORY_LABELS[props.locale]
  const greeting = props.name ? `${t.greeting}, ${props.name}` : t.greeting
  const empty =
    props.bundles.length === 0 && props.reminders.length === 0 && props.commitments.length === 0

  return (
    <Html lang={props.locale}>
      <Head />
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Heading style={styles.h1}>{greeting}</Heading>
          <Text style={styles.intro}>
            {props.date} · {t.intro}
          </Text>

          {empty ? <Text style={styles.item}>{t.nothing}</Text> : null}

          {props.reminders.length > 0 ? (
            <Section>
              <Text style={styles.h2}>{t.needYou}</Text>
              {props.reminders.map((r, i) => (
                <Text key={`rem-${i}`} style={styles.item}>
                  {r.subject} — {r.sender}
                </Text>
              ))}
            </Section>
          ) : null}

          {props.bundles.length > 0 ? (
            <Section>
              {props.bundles.map((b: DigestBundle) => (
                <Section key={b.category}>
                  <Text style={styles.bundle}>
                    <strong>{labels[b.category]}</strong>{' '}
                    <span style={styles.count}>
                      · {b.count} {t.unreadSuffix}
                    </span>
                  </Text>
                  {b.items.map((it, i) => (
                    <Text key={`${b.category}-${i}`} style={styles.item}>
                      {it.subject} — {it.sender}
                    </Text>
                  ))}
                </Section>
              ))}
            </Section>
          ) : null}

          {props.commitments.length > 0 ? (
            <Section>
              <Text style={styles.h2}>{t.promises}</Text>
              {props.commitments.map((c, i) => (
                <Text key={`com-${i}`} style={styles.item}>
                  {c.text} — {c.counterpart}
                </Text>
              ))}
            </Section>
          ) : null}

          {props.agentsHandled > 0 ? (
            <>
              <Hr />
              <Text style={styles.agents}>
                {props.agentsHandled} {t.agents}
              </Text>
            </>
          ) : null}
        </Container>
      </Body>
    </Html>
  )
}
