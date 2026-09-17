import { describe, expect, it, vi } from 'vitest'

vi.mock('@revido/db/client', () => ({ asService: vi.fn(), withUser: vi.fn() }))
vi.mock('./crypto', () => ({ ensureUserKey: vi.fn(), getUserCrypto: vi.fn() }))
vi.mock('./jobs', () => ({ enqueueJob: vi.fn(), JobQueue: { backfill: 'backfill' } }))

import { normalizeMailboxEmail } from './mailbox-link'

describe('normalizeMailboxEmail', () => {
  it('uses a stable lowercase, trimmed mailbox identity', () => {
    expect(normalizeMailboxEmail('  Person@Example.COM ')).toBe('person@example.com')
  })
})
