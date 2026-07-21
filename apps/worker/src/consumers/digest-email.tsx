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
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
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
  dueAt?: string
}

const COPY = {
  en: {
    brand: 'REVIDO MAIL',
    singular: 'priority',
    plural: 'priorities',
    intro: 'The shortest useful version of your inbox.',
    reply: 'Reply',
    due: 'Due',
    more: 'The rest stays in Revido until you are ready.',
    agents: (count: number) => `${count} handled automatically since yesterday.`,
    cta: 'Open Revido Mail',
    preview: (count: number) =>
      count === 1 ? 'One priority worth opening.' : `${count} priorities worth opening.`,
  },
  nl: {
    brand: 'REVIDO MAIL',
    singular: 'prioriteit',
    plural: 'prioriteiten',
    intro: 'De kortste bruikbare versie van je inbox.',
    reply: 'Antwoord',
    due: 'Deadline',
    more: 'De rest blijft in Revido tot je er klaar voor bent.',
    agents: (count: number) => `${count} automatisch afgehandeld sinds gisteren.`,
    cta: 'Open Revido Mail',
    preview: (count: number) =>
      count === 1 ? 'Eén prioriteit om te openen.' : `${count} prioriteiten om te openen.`,
  },
} as const

const styles = {
  body: {
    backgroundColor: '#f4f1eb',
    color: '#171513',
    fontFamily: "'Trebuchet MS', Tahoma, sans-serif",
    margin: 0,
  },
  container: {
    backgroundColor: '#ffffff',
    borderTop: '5px solid #d97706',
    margin: '32px auto',
    maxWidth: '560px',
    padding: '0 32px 32px',
  },
  brand: {
    color: '#8a8178',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '1.8px',
    margin: '28px 0 22px',
  },
  h1: {
    color: '#171513',
    fontSize: '32px',
    fontWeight: 700,
    letterSpacing: '-1px',
    lineHeight: '38px',
    margin: 0,
  },
  intro: { color: '#746b63', fontSize: '14px', lineHeight: '22px', margin: '8px 0 26px' },
  item: { borderTop: '1px solid #e8e3dc', padding: '16px 0 14px' },
  itemLabel: {
    color: '#b45309',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '1.2px',
    margin: '0 0 5px',
    textTransform: 'uppercase' as const,
  },
  itemTitle: {
    color: '#171513',
    fontSize: '15px',
    fontWeight: 700,
    lineHeight: '21px',
    margin: 0,
  },
  itemDetail: { color: '#746b63', fontSize: '12px', lineHeight: '18px', margin: '3px 0 0' },
  quiet: { color: '#8a8178', fontSize: '12px', lineHeight: '19px', margin: '18px 0 0' },
  button: {
    backgroundColor: '#171513',
    borderRadius: '8px',
    color: '#ffffff',
    display: 'inline-block',
    fontSize: '13px',
    fontWeight: 700,
    marginTop: '24px',
    padding: '12px 18px',
    textDecoration: 'none',
  },
  footer: { color: '#9a9188', fontSize: '10px', lineHeight: '16px', margin: '24px 0 0' },
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
          <Text style={styles.brand}>{t.brand}</Text>
          <Heading style={styles.h1}>
            {count} {noun}
          </Heading>
          <Text style={styles.intro}>
            {formatDate(props.locale, props.date)} · {t.intro}
          </Text>

          {props.items.map((item, index) => (
            <Section key={`${item.kind}-${index}`} style={styles.item}>
              <Text style={styles.itemLabel}>{item.kind === 'reply' ? t.reply : t.due}</Text>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemDetail}>
                {item.detail}
                {item.dueAt ? ` · ${formatDue(props.locale, item.dueAt)}` : ''}
              </Text>
            </Section>
          ))}

          {props.hiddenCount > 0 ? <Text style={styles.quiet}>{t.more}</Text> : null}
          {props.agentsHandled > 0 ? (
            <Text style={styles.quiet}>{t.agents(props.agentsHandled)}</Text>
          ) : null}

          <Button href={props.appUrl} style={styles.button}>
            {t.cta}
          </Button>
          <Hr style={{ borderColor: '#e8e3dc', margin: '28px 0 0' }} />
          <Text style={styles.footer}>Revido Mail · email.revido.co</Text>
        </Container>
      </Body>
    </Html>
  )
}
