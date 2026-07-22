import { describe, expect, it } from 'vitest'
import type { Message, Thread } from '@revido/db'
import {
  buildChatPrompt,
  buildDraftPrompt,
  buildRewritePrompt,
  buildSummaryPrompt,
  buildTriagePrompt,
} from './prompts'

const CATEGORY_IDS = [
  'to-reply',
  'awaiting-reply',
  'fyi',
  'newsletters',
  'notifications',
  'promotions',
  'receipts',
  'calendar',
  'personal',
]

describe('buildTriagePrompt', () => {
  const prompt = buildTriagePrompt({
    from: { name: 'Sam Rivera', email: 'sam@acme.com' },
    subject: 'Q3 numbers before Friday',
    body: 'Can you review the Q3 numbers before Friday?',
  })

  it('embeds the full nine-category taxonomy in the stable system prefix', () => {
    for (const id of CATEGORY_IDS) expect(prompt.system).toContain(id)
    expect(prompt.system).toContain('PRIORITY RUBRIC')
    expect(prompt.system).toContain('LANGUAGE DETECTION')
  })

  it('requests strict JSON matching the TriageResult shape', () => {
    for (const key of ['category', 'priorityScore', 'priority', 'tldr', 'language']) {
      expect(prompt.system).toContain(key)
    }
  })

  it("is long enough to clear Haiku's 4096-token minimum cacheable prefix", () => {
    // ~4 chars/token, so >= 16000 chars is a safe proxy for >4096 tokens.
    expect(prompt.system.length).toBeGreaterThanOrEqual(16000)
  })

  it('puts the volatile message content in the user turn', () => {
    expect(prompt.messages).toHaveLength(1)
    expect(prompt.messages[0]?.role).toBe('user')
    expect(prompt.messages[0]?.content).toContain('Q3 numbers before Friday')
    expect(prompt.messages[0]?.content).toContain('sam@acme.com')
  })
})

// ---- fixtures for thread-shaped builders ----

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: 'th-1',
    accountId: 'acc-1',
    subject: 'Q3 numbers before Friday',
    participants: [{ name: 'Sam Rivera', email: 'sam@acme.com' }],
    category: 'to-reply',
    priority: 'high',
    priorityScore: 74,
    tldr: 'Sam needs the Q3 numbers reviewed before Friday.',
    summary: '',
    unread: true,
    starred: false,
    snoozedUntil: null,
    hasAttachments: false,
    badges: [],
    extracted: [],
    messageIds: ['m-1'],
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
    html: '<p>Can you review the Q3 numbers before Friday?</p>',
    text: 'Can you review the Q3 numbers before Friday?',
    unread: true,
    outbound: false,
    attachments: [],
    ...overrides,
  }
}

describe('buildSummaryPrompt', () => {
  it('keeps a stable system prefix and renders the thread in the user turn', () => {
    const prompt = buildSummaryPrompt(makeThread(), [makeMessage()], { outputLanguage: 'en' })
    expect(prompt.system).toContain('summarize')
    const user = prompt.messages[0]?.content ?? ''
    expect(user).toContain('Q3 numbers before Friday')
    expect(user).toContain('review the Q3 numbers')
    expect(user).toContain('English (en)')
  })

  it('honors an explicit Dutch output language', () => {
    const prompt = buildSummaryPrompt(makeThread(), [makeMessage()], { outputLanguage: 'nl' })
    expect(prompt.messages[0]?.content).toContain('Dutch (nl)')
  })

  it('echoes the detected language when the preference is "match"', () => {
    const prompt = buildSummaryPrompt(makeThread(), [makeMessage()], {
      outputLanguage: 'match',
      detectedLanguage: 'nl',
    })
    const user = prompt.messages[0]?.content ?? ''
    expect(user).toContain('Dutch (nl)')
    expect(user).toContain('source email')
  })
})

describe('buildDraftPrompt', () => {
  it('includes steering guidance when provided', () => {
    const prompt = buildDraftPrompt(
      makeThread(),
      [makeMessage()],
      { outputLanguage: 'en' },
      'Keep it short and say yes.',
    )
    expect(prompt.system).toContain('draft')
    expect(prompt.messages[0]?.content).toContain('Keep it short and say yes.')
  })
})

describe('buildRewritePrompt', () => {
  it('wraps the draft and the instruction in the user turn', () => {
    const prompt = buildRewritePrompt('Hey, sure thing.', 'Make it more formal.', {
      outputLanguage: 'en',
    })
    const user = prompt.messages[0]?.content ?? ''
    expect(user).toContain('Hey, sure thing.')
    expect(user).toContain('Make it more formal.')
  })
})

describe('buildChatPrompt', () => {
  it('grounds the answer in retrieved chunks and labels them', () => {
    const prompt = buildChatPrompt(
      'When is the Q3 review due?',
      [{ source: 'Sam Rivera — Q3 numbers', text: 'Please review before Friday.' }],
      { outputLanguage: 'en' },
    )
    const user = prompt.messages[0]?.content ?? ''
    expect(user).toContain('Sam Rivera — Q3 numbers')
    expect(user).toContain('Please review before Friday.')
    expect(user).toContain('When is the Q3 review due?')
  })

  it('handles the no-context case explicitly', () => {
    const prompt = buildChatPrompt('Anything from my bank?', [], { outputLanguage: 'en' })
    expect(prompt.messages[0]?.content).toContain('no relevant email excerpts')
  })

  it('prepends prior conversation turns for multi-turn follow-ups', () => {
    const prompt = buildChatPrompt(
      'What about the invoice?',
      [{ source: 'Acme — Invoice', date: '2026-01-10T00:00:00.000Z', text: 'Due Friday.' }],
      { outputLanguage: 'en' },
      [
        { role: 'user', content: 'Who emailed me about Acme?' },
        { role: 'assistant', content: 'Jane from Acme.' },
      ],
    )
    // History comes first (oldest→newest), then the grounded context turn last.
    expect(prompt.messages).toHaveLength(3)
    expect(prompt.messages[0]).toEqual({ role: 'user', content: 'Who emailed me about Acme?' })
    expect(prompt.messages[1]).toEqual({ role: 'assistant', content: 'Jane from Acme.' })
    const last = prompt.messages[2]!
    expect(last.role).toBe('user')
    expect(last.content).toContain('What about the invoice?')
    // The retrieved excerpt's ISO date is surfaced so the model can reason on recency.
    expect(last.content).toContain('2026-01-10')
  })

  it('surfaces excerpt dates so the model can answer "latest" questions', () => {
    const prompt = buildChatPrompt(
      'What is the latest?',
      [{ source: 'A', date: '2026-02-01T00:00:00.000Z', text: 'newer' }],
      { outputLanguage: 'en' },
    )
    expect(prompt.messages[0]?.content).toContain('2026-02-01')
  })
})
