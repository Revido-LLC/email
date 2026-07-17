import { describe, expect, it } from 'vitest'
import type { Message, Thread } from '@revido/db'
import {
  MULTILINGUAL_POLICY,
  localeName,
  messageBodyText,
  outputLanguageDirective,
  renderThreadTranscript,
  userTurn,
} from './shared'

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: 'th-1',
    accountId: 'acc-1',
    subject: 'Q3 numbers before Friday',
    participants: [],
    category: 'to-reply',
    priority: 'high',
    priorityScore: 74,
    tldr: '',
    summary: '',
    unread: true,
    starred: false,
    snoozedUntil: null,
    hasAttachments: false,
    badges: [],
    extracted: [],
    messageIds: [],
    lastMessageAt: '2024-07-15T00:00:00Z',
    awaitingReply: false,
    labels: [],
    ...overrides,
  }
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm-1',
    threadId: 'th-1',
    from: { name: 'Sam Rivera', email: 'sam@acme.com' },
    to: [{ name: 'Jane Doe', email: 'jane@example.com' }],
    date: '2024-07-15T00:00:00Z',
    html: '<p>Hi</p>',
    text: 'Hi',
    unread: true,
    outbound: false,
    attachments: [],
    ...overrides,
  }
}

describe('localeName', () => {
  it('maps supported locales to display names', () => {
    expect(localeName('en')).toBe('English')
    expect(localeName('nl')).toBe('Dutch')
  })
})

describe('MULTILINGUAL_POLICY', () => {
  it('names both supported languages in a stable, data-free line', () => {
    expect(MULTILINGUAL_POLICY).toContain('English and Dutch')
    // Must be free of per-request data so it can live in the cached system prefix.
    expect(MULTILINGUAL_POLICY).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })
})

describe('outputLanguageDirective', () => {
  it('phrases "match" as: follow the source email language', () => {
    const d = outputLanguageDirective({ outputLanguage: 'match', detectedLanguage: 'nl' })
    expect(d).toContain('Dutch (nl)')
    expect(d).toContain('source email')
    expect(d).toContain('Do not translate')
  })

  it('phrases an explicit language as: regardless of the source', () => {
    const d = outputLanguageDirective({ outputLanguage: 'en', detectedLanguage: 'nl' })
    expect(d).toContain('English (en)')
    expect(d).toContain('regardless of the language of the source email')
  })

  it('falls back to the default locale when "match" has no detected language', () => {
    expect(outputLanguageDirective({ outputLanguage: 'match' })).toContain('English (en)')
  })
})

describe('messageBodyText', () => {
  it('prefers the plain-text part when present', () => {
    expect(messageBodyText({ text: '  hello  ', html: '<p>ignored</p>' })).toBe('hello')
  })

  it('strips HTML (scripts/styles removed, block tags become newlines) when no text', () => {
    const html = '<style>.x{}</style><h1>Title</h1><p>Line one</p><p>Line two</p><script>bad()</script>'
    const out = messageBodyText({ text: '', html })
    expect(out).toContain('Title')
    expect(out).toContain('Line one')
    expect(out).toContain('Line two')
    expect(out).not.toContain('bad()')
    expect(out).not.toContain('<')
  })

  it('decodes common entities and returns empty for an empty body', () => {
    expect(messageBodyText({ text: '', html: 'A&nbsp;&amp;&lt;B&gt;' })).toBe('A &<B>')
    expect(messageBodyText({ text: '', html: '' })).toBe('')
  })
})

describe('renderThreadTranscript', () => {
  it('renders subject, per-message direction, recipients, and numbering', () => {
    const thread = makeThread()
    const transcript = renderThreadTranscript(thread, [
      makeMessage({ text: 'Can you review?' }),
      makeMessage({ outbound: true, from: { name: 'Me', email: 'me@x.co' }, text: 'On it.' }),
    ])
    expect(transcript).toContain('Subject: Q3 numbers before Friday')
    expect(transcript).toContain('Message 1 of 2')
    expect(transcript).toContain('received')
    expect(transcript).toContain('from Sam Rivera <sam@acme.com>')
    expect(transcript).toContain('To: Jane Doe <jane@example.com>')
    expect(transcript).toContain('Message 2 of 2')
    expect(transcript).toContain('sent by the user')
    expect(transcript).toContain('On it.')
  })

  it('formats a contact with no name as the bare email', () => {
    const transcript = renderThreadTranscript(makeThread(), [
      makeMessage({ from: { name: '', email: 'noreply@x.co' }, to: [] }),
    ])
    expect(transcript).toContain('from noreply@x.co')
  })
})

describe('userTurn', () => {
  it('joins the directive and non-empty blocks into a single user message', () => {
    const turn = userTurn('WRITE IN ENGLISH', 'Block A', '', 'Block B')
    expect(turn).toHaveLength(1)
    expect(turn[0]?.role).toBe('user')
    expect(turn[0]?.content).toBe('WRITE IN ENGLISH\n\nBlock A\n\nBlock B')
  })
})
