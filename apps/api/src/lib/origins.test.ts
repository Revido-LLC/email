import { describe, expect, it } from 'vitest'
import { webOrigins } from './origins'

describe('webOrigins', () => {
  it('normalizes one or more configured web origins', () => {
    expect(
      webOrigins({
        WEB_ORIGIN: ' https://email.revido.co/, https://staging.email.revido.co ',
      } as NodeJS.ProcessEnv),
    ).toEqual(['https://email.revido.co', 'https://staging.email.revido.co'])
  })

  it('returns no trusted origins when WEB_ORIGIN is absent', () => {
    expect(webOrigins({} as NodeJS.ProcessEnv)).toEqual([])
  })
})
