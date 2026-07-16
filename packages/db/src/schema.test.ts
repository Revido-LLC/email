import { describe, expect, it } from 'vitest'
import type { CategoryId, Priority, Provider } from './domain'
import { categoryEnum, priorityEnum, providerEnum } from './schema/enums'
import { messages, threads, users } from './schema'
import { ciphertextSchema, Dto, threadsInsertSchema } from './zod'

describe('enum ⇄ domain parity', () => {
  it('category enum matches the 9 locked CategoryId members exactly', () => {
    const domain: CategoryId[] = [
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
    expect([...categoryEnum.enumValues].sort()).toEqual([...domain].sort())
  })

  it('priority enum matches Priority', () => {
    const domain: Priority[] = ['urgent', 'high', 'normal', 'low']
    expect([...priorityEnum.enumValues].sort()).toEqual([...domain].sort())
  })

  it('provider enum matches Provider', () => {
    const domain: Provider[] = ['gmail', 'outlook']
    expect([...providerEnum.enumValues].sort()).toEqual([...domain].sort())
  })
})

describe('ciphertext boundary', () => {
  it('content columns are typed as the Ciphertext envelope', () => {
    // $inferSelect keeps the Ciphertext shape (nullable) on encrypted columns.
    const t = null as unknown as typeof threads.$inferSelect
    const m = null as unknown as typeof messages.$inferSelect
    // Type-level only; the assignments compile iff the columns are Ciphertext|null.
    const subject: { ct: string; iv: string; tag: string; v: number } | null = t?.subjectCt ?? null
    const body: { ct: string; iv: string; tag: string; v: number } | null = m?.htmlCt ?? null
    expect(subject).toBeNull()
    expect(body).toBeNull()
  })

  it('plaintext metadata columns stay queryable scalar types', () => {
    const u = null as unknown as typeof users.$inferSelect
    const email: string = u?.email ?? 'x@y.z'
    expect(typeof email).toBe('string')
  })

  it('ciphertextSchema validates the envelope shape', () => {
    const ok = ciphertextSchema.safeParse({ ct: 'a', iv: 'b', tag: 'c', v: 1 })
    expect(ok.success).toBe(true)
    const bad = ciphertextSchema.safeParse({ ct: 'a' })
    expect(bad.success).toBe(false)
  })
})

describe('zod DTOs', () => {
  it('threadsInsertSchema accepts a minimal valid row', () => {
    const parsed = threadsInsertSchema.safeParse({
      userId: '00000000-0000-0000-0000-000000000000',
      accountId: '00000000-0000-0000-0000-000000000000',
      category: 'to-reply',
      lastMessageAt: new Date(),
    })
    expect(parsed.success).toBe(true)
  })

  it('createLeadRequest requires a valid email', () => {
    expect(Dto.createLeadRequest.safeParse({ email: 'not-an-email' }).success).toBe(false)
    expect(Dto.createLeadRequest.safeParse({ email: 'a@b.co', source: 's8' }).success).toBe(true)
  })

  it('sendMessageRequest requires at least one recipient', () => {
    const base = { accountId: 'acc', subject: 'hi', html: '<p>hi</p>' }
    expect(Dto.sendMessageRequest.safeParse({ ...base, to: [] }).success).toBe(false)
    expect(Dto.sendMessageRequest.safeParse({ ...base, to: ['a@b.co'] }).success).toBe(true)
  })
})
