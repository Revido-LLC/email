/**
 * The daily-digest email template (`@react-email`), bilingual EN/NL.
 *
 * This is deliberately a shortlist, not a mirror of the inbox. It shows at most
 * three replies and two due items, then sends the reader back to Revido for the
 * rest. Keeping that ceiling here protects the email even when an inbox contains
 * thousands of unread threads.
 */

import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components'
import type { ReactElement } from 'react'

export type DigestLocale = 'en' | 'nl'

export interface DigestEmailProps {
  locale: DigestLocale
  date: string
  items: ShortlistItem[]
  hiddenCount: number
  agentsHandled: number
  appUrl: string
}

export interface ShortlistItem {
  kind: 'reply' | 'due'
  title: string
  detail: string
  href: string
  dueAt?: string
}

const COPY = {
  en: {
    brand: 'REVIDO / MORNING BRIEF',
    singular: 'priority',
    plural: 'priorities',
    headline: 'YOUR INBOX, DISTILLED.',
    intro: 'The few things worth your attention. Everything else stays out of the way.',
    shortlist: 'TODAY’S SHORTLIST',
    reply: 'Reply now',
    due: 'On your radar',
    more: 'The rest of your inbox is waiting quietly in Revido.',
    agents: (count: number) => `AUTOPILOT · ${count} handled since yesterday`,
    cta: 'Open the shortlist →',
    openEmail: 'Open email →',
    preview: (count: number) =>
      count === 1
        ? 'Your inbox, distilled to one move.'
        : `Your inbox, distilled to ${count} moves.`,
  },
  nl: {
    brand: 'REVIDO / OCHTENDBRIEFING',
    singular: 'prioriteit',
    plural: 'prioriteiten',
    headline: 'JE INBOX, TERUGGEBRACHT.',
    intro: 'Alleen wat je aandacht verdient. De rest blijft uit de weg.',
    shortlist: 'JOUW SHORTLIST VANDAAG',
    reply: 'Nu antwoorden',
    due: 'Op je radar',
    more: 'De rest van je inbox wacht rustig in Revido.',
    agents: (count: number) => `AUTOPILOOT · ${count} afgehandeld sinds gisteren`,
    cta: 'Open je shortlist →',
    openEmail: 'Open e-mail →',
    preview: (count: number) =>
      count === 1
        ? 'Je inbox, teruggebracht tot één actie.'
        : `Je inbox, teruggebracht tot ${count} acties.`,
  },
} as const

const styles = {
  body: {
    backgroundColor: '#ebe7df',
    color: '#141311',
    fontFamily: "'Trebuchet MS', Tahoma, sans-serif",
    margin: 0,
  },
  container: { backgroundColor: '#ffffff', margin: '32px auto', maxWidth: '600px', padding: 0 },
  hero: { backgroundColor: '#141311', padding: '30px 34px 34px' },
  brand: {
    color: '#ff6940',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '2px',
    margin: '0 0 26px',
  },
  countColumn: { verticalAlign: 'top', width: '118px' },
  count: {
    color: '#ff6940',
    fontFamily: "'Courier New', monospace",
    fontSize: '70px',
    fontWeight: 700,
    letterSpacing: '-6px',
    lineHeight: '70px',
    margin: 0,
  },
  headline: {
    color: '#ffffff',
    fontSize: '27px',
    fontWeight: 700,
    letterSpacing: '-0.8px',
    lineHeight: '31px',
    margin: '5px 0 7px',
  },
  heroIntro: { color: '#bdb7ad', fontSize: '13px', lineHeight: '20px', margin: 0 },
  date: { color: '#d8d2c8', fontSize: '12px', lineHeight: '18px', margin: '22px 0 0' },
  content: { padding: '27px 34px 8px' },
  shortlist: {
    color: '#625b54',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '1.7px',
    margin: '0 0 8px',
  },
  item: { borderBottom: '1px solid #e9e4dd', padding: '17px 0 16px' },
  indexColumn: { verticalAlign: 'top', width: '42px' },
  index: {
    color: '#ff6940',
    fontFamily: "'Courier New', monospace",
    fontSize: '12px',
    fontWeight: 700,
    lineHeight: '18px',
    margin: '1px 0 0',
  },
  itemLabel: {
    color: '#746c64',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '1.1px',
    margin: '0 0 4px',
    textTransform: 'uppercase' as const,
  },
  itemTitle: {
    color: '#141311',
    fontSize: '16px',
    fontWeight: 700,
    lineHeight: '21px',
    margin: 0,
  },
  itemDetail: { color: '#817970', fontSize: '12px', lineHeight: '18px', margin: '4px 0 0' },
  itemButton: {
    backgroundColor: '#f0ece5',
    border: '1px solid #ddd6cc',
    borderRadius: '2px',
    color: '#141311',
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: 700,
    marginTop: '10px',
    padding: '7px 10px',
    textDecoration: 'none',
  },
  quiet: { color: '#817970', fontSize: '12px', lineHeight: '19px', margin: '18px 0 0' },
  autopilot: {
    backgroundColor: '#fff0eb',
    borderLeft: '4px solid #ff6940',
    color: '#8f321c',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.7px',
    lineHeight: '18px',
    margin: '20px 0 0',
    padding: '11px 13px',
  },
  button: {
    backgroundColor: '#ff6940',
    borderRadius: '2px',
    color: '#141311',
    display: 'inline-block',
    fontSize: '14px',
    fontWeight: 700,
    marginTop: '26px',
    padding: '14px 20px',
    textDecoration: 'none',
  },
  footerSection: { backgroundColor: '#141311', padding: '18px 34px' },
  footer: { color: '#8e8981', fontSize: '10px', lineHeight: '16px', margin: 0 },
}

function formatDate(locale: DigestLocale, value: string): string {
  return new Intl.DateTimeFormat(locale === 'nl' ? 'nl-NL' : 'en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

function formatDue(locale: DigestLocale, value: string): string {
  return new Intl.DateTimeFormat(locale === 'nl' ? 'nl-NL' : 'en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value))
}

/** The digest email as a react-email component tree. */
export function DigestEmail(props: DigestEmailProps): ReactElement {
  const t = COPY[props.locale]
  const count = props.items.length
  const noun = count === 1 ? t.singular : t.plural

  return (
    <Html lang={props.locale}>
      <Head />
      <Preview>{t.preview(count)}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.hero}>
            <Text style={styles.brand}>{t.brand}</Text>
            <Row>
              <Column style={styles.countColumn}>
                <Text style={styles.count}>{String(count).padStart(2, '0')}</Text>
              </Column>
              <Column style={{ verticalAlign: 'top' }}>
                <Heading style={styles.headline}>{t.headline}</Heading>
                <Text style={styles.heroIntro}>{t.intro}</Text>
              </Column>
            </Row>
            <Text style={styles.date}>
              {formatDate(props.locale, props.date)} · {count} {noun}
            </Text>
          </Section>

          <Section style={styles.content}>
            <Text style={styles.shortlist}>{t.shortlist}</Text>
            {props.items.map((item, index) => (
              <Row key={`${item.kind}-${index}`} style={styles.item}>
                <Column style={styles.indexColumn}>
                  <Text style={styles.index}>{String(index + 1).padStart(2, '0')}</Text>
                </Column>
                <Column style={{ verticalAlign: 'top' }}>
                  <Text style={styles.itemLabel}>{item.kind === 'reply' ? t.reply : t.due}</Text>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemDetail}>
                    {item.detail}
                    {item.dueAt ? ` · ${formatDue(props.locale, item.dueAt)}` : ''}
                  </Text>
                  <Button href={item.href} style={styles.itemButton}>
                    {t.openEmail}
                  </Button>
                </Column>
              </Row>
            ))}

            {props.hiddenCount > 0 ? <Text style={styles.quiet}>{t.more}</Text> : null}
            {props.agentsHandled > 0 ? (
              <Text style={styles.autopilot}>{t.agents(props.agentsHandled)}</Text>
            ) : null}

            <Button href={props.appUrl} style={styles.button}>
              {t.cta}
            </Button>
            <Hr style={{ borderColor: '#e9e4dd', margin: '30px 0 0' }} />
          </Section>
          <Section style={styles.footerSection}>
            <Text style={styles.footer}>REVIDO MAIL · EMAIL.REVIDO.CO</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
