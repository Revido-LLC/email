import { describe, expect, it } from 'vitest'
import { CRYPTO_SCHEME_VERSION } from './crypto'
import {
  categorySchema,
  ciphertextSchema,
  Dto,
  outputLanguageSchema,
  prioritySchema,
  providerSchema,
} from './zod'

describe('primitive enums', () => {
  it('categorySchema accepts the 9 locked categories and rejects others', () => {
    for (const c of [
      'to-reply',
      'awaiting-reply',
      'fyi',
      'newsletters',
      'notifications',
      'promotions',
      'receipts',
      'calendar',
      'personal',
    ]) {
      expect(categorySchema.safeParse(c).success).toBe(true)
    }
    expect(categorySchema.safeParse('spam').success).toBe(false)
  })

  it('prioritySchema / providerSchema / outputLanguageSchema round-trip', () => {
    expect(prioritySchema.safeParse('urgent').success).toBe(true)
    expect(prioritySchema.safeParse('meh').success).toBe(false)
    expect(providerSchema.safeParse('gmail').success).toBe(true)
    expect(providerSchema.safeParse('outlook').success).toBe(true)
    expect(providerSchema.safeParse('yahoo').success).toBe(false)
    expect(outputLanguageSchema.safeParse('match').success).toBe(true)
    expect(outputLanguageSchema.safeParse('fr').success).toBe(false)
  })
})

describe('ciphertextSchema', () => {
  it('defaults the scheme version when omitted', () => {
    const parsed = ciphertextSchema.parse({ ct: 'a', iv: 'b', tag: 'c' })
    expect(parsed.v).toBe(CRYPTO_SCHEME_VERSION)
  })

  it('rejects a non-integer version and missing fields', () => {
    expect(ciphertextSchema.safeParse({ ct: 'a', iv: 'b', tag: 'c', v: 1.5 }).success).toBe(false)
    expect(ciphertextSchema.safeParse({ iv: 'b', tag: 'c' }).success).toBe(false)
  })
})

describe('Dto.contact', () => {
  it('requires a valid email and, if present, a valid avatar URL', () => {
    expect(Dto.contact.safeParse({ name: 'Sam', email: 'sam@acme.com' }).success).toBe(true)
    expect(Dto.contact.safeParse({ name: 'Sam', email: 'nope' }).success).toBe(false)
    expect(
      Dto.contact.safeParse({ name: 'Sam', email: 'sam@acme.com', avatarUrl: 'not-a-url' }).success,
    ).toBe(false)
  })
})

describe('Dto.attachment / threadBadge / extractedFact', () => {
  it('constrains attachment kind to the closed set', () => {
    const base = { id: 'a', name: 'q3.pdf', size: '2 KB', mime: 'application/pdf' }
    expect(Dto.attachment.safeParse({ ...base, kind: 'pdf' }).success).toBe(true)
    expect(Dto.attachment.safeParse({ ...base, kind: 'exe' }).success).toBe(false)
  })

  it('constrains thread badge and extracted fact kinds', () => {
    expect(Dto.threadBadge.safeParse({ kind: 'amount', label: '€12' }).success).toBe(true)
    expect(Dto.threadBadge.safeParse({ kind: 'sparkle', label: 'x' }).success).toBe(false)
    expect(
      Dto.extractedFact.safeParse({ type: 'date', label: 'Due', value: 'Fri' }).success,
    ).toBe(true)
    expect(Dto.extractedFact.safeParse({ type: 'mystery', label: 'x', value: 'y' }).success).toBe(
      false,
    )
  })
})

describe('Dto.sendMessageRequest', () => {
  const base = { accountId: 'acc', subject: 'hi', html: '<p>hi</p>', to: ['a@b.co'] }

  it('validates recipient emails in cc/bcc', () => {
    expect(Dto.sendMessageRequest.safeParse({ ...base, cc: ['ok@b.co'] }).success).toBe(true)
    expect(Dto.sendMessageRequest.safeParse({ ...base, cc: ['not-email'] }).success).toBe(false)
    expect(Dto.sendMessageRequest.safeParse({ ...base, bcc: ['x@y.co'] }).success).toBe(true)
  })

  it('accepts an ISO sendAt but rejects a non-datetime', () => {
    expect(
      Dto.sendMessageRequest.safeParse({ ...base, sendAt: '2026-07-18T09:00:00Z' }).success,
    ).toBe(true)
    expect(Dto.sendMessageRequest.safeParse({ ...base, sendAt: 'tomorrow' }).success).toBe(false)
  })
})

describe('Dto.updateThreadRequest', () => {
  it('accepts partial triage mutations and a nullable snooze', () => {
    expect(Dto.updateThreadRequest.safeParse({ starred: true }).success).toBe(true)
    expect(Dto.updateThreadRequest.safeParse({ category: 'fyi' }).success).toBe(true)
    expect(Dto.updateThreadRequest.safeParse({ snoozedUntil: null }).success).toBe(true)
    expect(
      Dto.updateThreadRequest.safeParse({ snoozedUntil: '2026-07-20T00:00:00Z' }).success,
    ).toBe(true)
  })

  it('rejects an invalid category or a non-datetime snooze', () => {
    expect(Dto.updateThreadRequest.safeParse({ category: 'spam' }).success).toBe(false)
    expect(Dto.updateThreadRequest.safeParse({ snoozedUntil: 'soon' }).success).toBe(false)
  })
})

describe('Dto.decideApprovalRequest', () => {
  it('constrains the decision to approve/reject', () => {
    expect(
      Dto.decideApprovalRequest.safeParse({ approvalId: 'x', decision: 'approve' }).success,
    ).toBe(true)
    expect(
      Dto.decideApprovalRequest.safeParse({ approvalId: 'x', decision: 'maybe' }).success,
    ).toBe(false)
  })
})

describe('Dto.createLeadRequest', () => {
  it('caps the message length at 4000 chars', () => {
    expect(
      Dto.createLeadRequest.safeParse({ email: 'a@b.co', message: 'x'.repeat(4000) }).success,
    ).toBe(true)
    expect(
      Dto.createLeadRequest.safeParse({ email: 'a@b.co', message: 'x'.repeat(4001) }).success,
    ).toBe(false)
  })
})
