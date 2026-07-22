import { describe, expect, it } from 'vitest'
import { makePseudonymizer } from './pii-pseudonymize'

const CONTACTS = [
  { name: 'John Ryan', email: 'john@readi.com' },
  { name: 'Sarah Chen', email: 'sarah@readi.com' },
]

describe('makePseudonymizer.encode', () => {
  it('replaces known names + emails with opaque tokens (no real PII leaves)', () => {
    const p = makePseudonymizer(CONTACTS)
    const enc = p.encode('John Ryan asked to add Sarah Chen (sarah@readi.com) to Slack.')
    expect(enc).not.toMatch(/John Ryan|Sarah Chen|sarah@readi\.com/)
    expect(enc).toMatch(/Contact_\d+/)
    expect(enc).toMatch(/Mailbox_\d+/)
  })

  it('is case-insensitive and matches longest names first', () => {
    const p = makePseudonymizer([{ name: 'John Ryan' }, { name: 'John Ryan Jr' }])
    const enc = p.encode('cc JOHN RYAN JR and john ryan')
    // "John Ryan Jr" must not be half-replaced by "John Ryan".
    expect(enc).not.toMatch(/John Ryan/i)
  })

  it('tokenizes an unknown email found only in the body', () => {
    const p = makePseudonymizer([])
    const enc = p.encode('forward to accounting@acme.co please')
    expect(enc).not.toContain('accounting@acme.co')
    expect(enc).toMatch(/Mailbox_\d+/)
  })

  it('leaves text without known PII untouched', () => {
    const p = makePseudonymizer(CONTACTS)
    expect(p.encode('the invoice is due Friday')).toBe('the invoice is due Friday')
  })
})

describe('encode → decode round-trip', () => {
  it('restores the original real values', () => {
    const p = makePseudonymizer(CONTACTS)
    const original = 'John Ryan emailed sarah@readi.com about Sarah Chen.'
    expect(p.decode(p.encode(original))).toBe(original)
  })
})

describe('streaming decoder', () => {
  it('restores tokens even when a token is split across chunks', () => {
    const p = makePseudonymizer(CONTACTS)
    p.encode('John Ryan') // populate the map → Contact_1
    const dec = p.decoder()
    // Simulate the model streaming "Contact_1" split as "Con" / "tact_" / "1 replied"
    let out = ''
    out += dec.push('The last email from Con')
    out += dec.push('tact_')
    out += dec.push('1 said hi')
    out += dec.flush()
    expect(out).toBe('The last email from John Ryan said hi')
  })

  it('does not confuse Contact_1 with Contact_10', () => {
    const p = makePseudonymizer(
      Array.from({ length: 10 }, (_, i) => ({ name: `Person${i}` })),
    )
    // Force 10 name tokens Contact_1..Contact_10
    p.encode(Array.from({ length: 10 }, (_, i) => `Person${i}`).join(' '))
    const dec = p.decoder()
    const out = dec.push('ref Contact_10 and Contact_1.') + dec.flush()
    expect(out).toContain('Person9') // Contact_10 → the 10th assigned (Person9)
    expect(out).toContain('Person0') // Contact_1 → the 1st assigned (Person0)
    expect(out).not.toMatch(/Contact_/)
  })

  it('flush restores a trailing token with no following boundary', () => {
    const p = makePseudonymizer(CONTACTS)
    p.encode('John Ryan')
    const dec = p.decoder()
    const out = dec.push('from Contact_1') + dec.flush()
    expect(out).toBe('from John Ryan')
  })

  it('passes through a stream with no tokens unchanged', () => {
    const p = makePseudonymizer(CONTACTS)
    const dec = p.decoder()
    const out = dec.push('no names here ') + dec.push('just text') + dec.flush()
    expect(out).toBe('no names here just text')
  })
})
