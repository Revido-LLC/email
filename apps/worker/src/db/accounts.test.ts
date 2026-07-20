import { describe, expect, it } from 'vitest'
import { serializeCiphertext, tokenExpiryIso } from './accounts'

describe('tokenExpiryIso', () => {
  it('normalizes Date and database string timestamps', () => {
    const expected = '2026-07-20T12:00:00.000Z'

    expect(tokenExpiryIso(new Date(expected))).toBe(expected)
    expect(tokenExpiryIso('2026-07-20 12:00:00+00')).toBe(expected)
  })

  it('uses the epoch when no expiry was stored', () => {
    expect(tokenExpiryIso(null)).toBe('1970-01-01T00:00:00.000Z')
  })

  it('rejects an invalid database timestamp', () => {
    expect(() => tokenExpiryIso('not-a-timestamp')).toThrow('invalid OAuth token expiry')
  })
})

describe('serializeCiphertext', () => {
  it('produces JSON text suitable for an explicit jsonb cast', () => {
    expect(
      JSON.parse(serializeCiphertext({ ct: 'ciphertext', iv: 'iv', tag: 'tag', v: 1 })),
    ).toEqual({ ct: 'ciphertext', iv: 'iv', tag: 'tag', v: 1 })
  })
})
