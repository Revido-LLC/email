import { describe, expect, it, vi } from 'vitest'
import { FakeLlmClient } from '@revido/core'
import type { AccountCrypto, UserContext } from '../db/accounts'
import type { SaveVoiceProfileInput } from '../mail/store'
import { makeVoiceProfileConsumer, type VoiceProfileDeps } from './voice-profile'

const passthroughCrypto: AccountCrypto = {
  encrypt: (plaintext) => ({ ct: plaintext, iv: '', tag: '', v: 1 }),
  decrypt: (ciphertext) => ciphertext.ct,
}

const USER_ID = '22222222-2222-2222-2222-222222222222'
const PAYLOAD = { userId: USER_ID }
const JOB = { id: 'j', queue: 'voice_profile', payload: PAYLOAD, attempts: 0, maxAttempts: 5 }

function fakeUser(): UserContext {
  return { userId: USER_ID, dek: new Uint8Array(32), crypto: passthroughCrypto }
}

describe('makeVoiceProfileConsumer', () => {
  it('analyzes sent mail and saves a voice profile', async () => {
    const saved: SaveVoiceProfileInput[] = []
    const increments: string[] = []
    const deps: VoiceProfileDeps = {
      loadUser: () => Promise.resolve(fakeUser()),
      mail: {
        getSentBodies: () => Promise.resolve(['Hi there,\nThanks!', 'Cheers,\nAda', 'Best,\nAda']),
        saveVoiceProfile: async (input) => {
          saved.push(input)
        },
        increment: async (_userId, metric) => {
          increments.push(metric)
        },
      },
      llm: new FakeLlmClient(), // echoes the user turn as the "profile"
    }

    await makeVoiceProfileConsumer(deps)(PAYLOAD, JOB)

    expect(saved).toHaveLength(1)
    expect(saved[0]?.userId).toBe(USER_ID)
    expect(saved[0]?.profile.length).toBeGreaterThan(0)
    expect(increments).toEqual(['ai_voice_profiles'])
  })

  it('skips users with too few sent messages to model a voice', async () => {
    const saveVoiceProfile = vi.fn()
    const deps: VoiceProfileDeps = {
      loadUser: () => Promise.resolve(fakeUser()),
      mail: {
        getSentBodies: () => Promise.resolve(['only one']),
        saveVoiceProfile,
        increment: vi.fn(),
      },
      llm: new FakeLlmClient(),
    }

    await makeVoiceProfileConsumer(deps)(PAYLOAD, JOB)
    expect(saveVoiceProfile).not.toHaveBeenCalled()
  })
})
