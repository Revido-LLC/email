import { describe, expect, it } from 'vitest'
import { detectTemporalIntent, keywordScore, rankChunks, type RankableChunk } from './chat-rank'

const iso = (daysAgo: number): string =>
  new Date(Date.UTC(2026, 0, 20) - daysAgo * 86_400_000).toISOString()

function chunk(over: Partial<RankableChunk> & Pick<RankableChunk, 'threadId'>): RankableChunk {
  return { subject: '', text: '', date: iso(0), distance: 0.2, ...over }
}

describe('detectTemporalIntent', () => {
  it.each([
    ['whats the last email about readi watch', true],
    ['latest invoice from acme', true],
    ['what did John say recently', true],
    ["today's newsletters", true],
    ['summarize the contract terms', false],
    ['who is the CEO of ReaDI', false],
  ])('%s → %s', (q, expected) => {
    expect(detectTemporalIntent(q)).toBe(expected)
  })
})

describe('keywordScore', () => {
  it('is the fraction of distinct query terms present in subject+body', () => {
    // terms: readi, watch, invoice → 2 of 3 present
    expect(keywordScore('ReaDI Watch invoice', 'Re: ReaDI Watch', 'the watch is on')).toBeCloseTo(
      2 / 3,
    )
  })

  it('ignores sub-3-char tokens and dedupes', () => {
    // terms(>=3): acme → present
    expect(keywordScore('an acme acme', 'Acme Corp', '')).toBe(1)
  })

  it('is 0 when nothing matches or no usable terms', () => {
    expect(keywordScore('quarterly report', 'lunch plans', 'see you at noon')).toBe(0)
    expect(keywordScore('a to it', 'anything', '')).toBe(0)
  })
})

describe('rankChunks', () => {
  it('for a temporal query, returns the NEWEST matching thread first', () => {
    // Same subject/keywords; older one is slightly closer semantically. Recency must win.
    const older = chunk({ threadId: 'old', subject: 'ReaDI Watch', date: iso(30), distance: 0.10 })
    const newer = chunk({ threadId: 'new', subject: 'ReaDI Watch', date: iso(1), distance: 0.18 })
    const [first] = rankChunks([older, newer], 'whats the last email about ReaDI Watch', {
      finalK: 2,
    })
    expect(first!.threadId).toBe('new')
  })

  it('for a non-temporal query, semantic closeness leads', () => {
    const close = chunk({ threadId: 'close', subject: 'x', date: iso(30), distance: 0.05 })
    const far = chunk({ threadId: 'far', subject: 'x', date: iso(0), distance: 0.9 })
    const [first] = rankChunks([close, far], 'explain the contract terms', { finalK: 2 })
    expect(first!.threadId).toBe('close')
  })

  it('keyword overlap rescues an exact match the embedding ranked lower', () => {
    const exact = chunk({
      threadId: 'exact',
      subject: 'ReaDI Watch signups',
      text: 'ReaDI Watch',
      date: iso(5),
      distance: 0.45,
    })
    const fuzzy = chunk({ threadId: 'fuzzy', subject: 'smartwatch news', date: iso(5), distance: 0.3 })
    const [first] = rankChunks([exact, fuzzy], 'ReaDI Watch', { finalK: 2 })
    expect(first!.threadId).toBe('exact')
  })

  it('caps output at finalK and never throws on a single candidate', () => {
    const one = [chunk({ threadId: 'a' })]
    expect(rankChunks(one, 'anything', { finalK: 8 })).toHaveLength(1)
    const many = Array.from({ length: 20 }, (_, i) => chunk({ threadId: `t${i}`, distance: i / 20 }))
    expect(rankChunks(many, 'q', { finalK: 8 })).toHaveLength(8)
  })

  it('returns [] for no candidates', () => {
    expect(rankChunks([], 'q', { finalK: 8 })).toEqual([])
  })
})
