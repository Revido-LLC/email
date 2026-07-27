import { beforeEach, describe, expect, it, vi } from 'vitest'

const { gmailConstructor, outlookConstructor } = vi.hoisted(() => ({
  gmailConstructor: vi.fn(),
  outlookConstructor: vi.fn(),
}))

vi.mock('@revido/core', () => ({
  GmailAdapter: class {
    provider = 'gmail' as const

    constructor(options: unknown) {
      gmailConstructor(options)
    }
  },
  OutlookAdapter: class {
    provider = 'outlook' as const

    constructor(options: unknown) {
      outlookConstructor(options)
    }
  },
}))

import { createAdapterFactory } from './adapters'

describe('createAdapterFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('caps the initial Gmail and Outlook provider requests at 100 messages', () => {
    createAdapterFactory({})

    expect(gmailConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ backfillPageSize: 100 }),
    )
    expect(outlookConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ backfillPageSize: 100 }),
    )
  })

  it('does not create another adapter when the same provider is requested repeatedly', () => {
    const adapterFor = createAdapterFactory({})

    const first = adapterFor('gmail')
    const second = adapterFor('gmail')

    expect(first).toBe(second)
    expect(gmailConstructor).toHaveBeenCalledTimes(1)
    expect(outlookConstructor).toHaveBeenCalledTimes(1)
  })
})
