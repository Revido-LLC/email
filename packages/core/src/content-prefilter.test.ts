// packages/core/src/content-prefilter.test.ts
import { describe, expect, it } from 'vitest'
import { detectDocType, prefilterVerdict } from './content-prefilter'

describe('detectDocType', () => {
  it('detects receipt / invoice / contract / shipping, else generic', () => {
    expect(detectDocType('a receipt for a completed payment')).toBe('receipt')
    expect(detectDocType('an invoice or bill')).toBe('invoice')
    expect(detectDocType('a signed contract or agreement')).toBe('contract')
    expect(detectDocType('a shipping or tracking notification')).toBe('shipping')
    expect(detectDocType('anything unusual')).toBe('generic')
  })
})

describe('prefilterVerdict (receipt)', () => {
  const receipt = 'receipt' as const
  // The four real dry-run false-positives from the bug report MUST all be excluded.
  it.each([
    '[FINAL NOTICE] Update your payment information - Account downgrade imminent',
    'ARIN Annual Fees Reminder Notice_60 Days Past Due_for Inv# SI539010',
    "URGENT: Your Twilio account couldn't be recharged",
    'Your Browserstack account has been suspended due to payment failures.',
  ])('excludes dunning subject: %s', (subject) => {
    expect(prefilterVerdict({ subject, snippet: '' }, receipt)).toBe('exclude')
  })

  it('passes a real receipt subject to the AI classifier', () => {
    expect(prefilterVerdict({ subject: 'Your receipt from Acme — payment received', snippet: '' }, receipt)).toBe('pass')
  })

  it('matches exclusion phrases in the snippet, case-insensitively', () => {
    expect(prefilterVerdict({ subject: 'Invoice 42', snippet: 'This account is PAST DUE.' }, receipt)).toBe('exclude')
  })
})

describe('prefilterVerdict (generic)', () => {
  it('always passes generic doc types (no regression for non-receipt agents)', () => {
    expect(prefilterVerdict({ subject: 'anything', snippet: 'final notice' }, 'generic')).toBe('pass')
  })
})
