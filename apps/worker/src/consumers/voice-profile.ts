/**
 * `voice-profile` consumer — learn the user's writing voice from their sent mail.
 *
 * Reads the decrypted bodies of the user's most recent SENT messages, runs a
 * Sonnet analysis that returns a compact STYLE profile (no private content), and
 * writes it to `users.voice_profile` (ciphertext under the user DEK). apps/api
 * reads that column to steer "in your voice" drafts. Enqueued per user on a cron
 * cadence (and can be enqueued after a backfill completes). A user with too few
 * sent messages is skipped — there isn't enough signal to model a voice yet.
 */

import type { LlmThinking } from '@revido/core'
import type { UserContext } from '../db/accounts'
import type { UsageStore, VoiceStore } from '../mail/store'
import type { WorkerLlmClient } from '../llm'
import type { JobConsumer } from '../queue/runner'
import { voiceProfilePayload } from '../queue/jobs'
import { buildVoiceProfilePrompt } from './prompts'

/** How many recent sent messages to sample, and the floor below which we skip. */
const SAMPLE_SIZE = 40
const MIN_SAMPLES = 3
const VOICE_MAX_TOKENS = 512

export interface VoiceProfileDeps {
  loadUser(userId: string): Promise<UserContext>
  mail: Pick<VoiceStore, 'getSentBodies' | 'saveVoiceProfile'> & Pick<UsageStore, 'increment'>
  llm: Pick<WorkerLlmClient, 'complete'>
}

export function makeVoiceProfileConsumer(deps: VoiceProfileDeps): JobConsumer {
  return async (payload) => {
    const { userId } = voiceProfilePayload.parse(payload)
    const user = await deps.loadUser(userId)

    const bodies = await deps.mail.getSentBodies(userId, user.crypto, SAMPLE_SIZE)
    if (bodies.length < MIN_SAMPLES) return // not enough signal yet.

    const prompt = buildVoiceProfilePrompt(bodies)
    const thinking: LlmThinking = { type: 'disabled' }
    const result = await deps.llm.complete({
      model: 'summary',
      system: prompt.system,
      messages: prompt.messages,
      maxTokens: VOICE_MAX_TOKENS,
      thinking,
      userId,
    })

    const profile = result.text.trim()
    if (!profile) return

    await deps.mail.saveVoiceProfile({ userId, crypto: user.crypto, profile })
    await deps.mail.increment(userId, 'ai_voice_profiles')
  }
}
