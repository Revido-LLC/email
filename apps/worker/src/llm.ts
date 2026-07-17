/**
 * The worker's Anthropic wiring — the one place that touches `@anthropic-ai/sdk`.
 *
 * `@revido/core`'s {@link AnthropicLlmClient} is written against a structural
 * `AnthropicMessagesClient` surface (core cannot depend on the SDK). This module
 * constructs the real SDK client (reading `ANTHROPIC_API_KEY`) and adapts its
 * `beta.messages` create/stream/batches methods onto that surface. `thinking` /
 * `output_config` are newer request-body fields carried through unchanged.
 */

import Anthropic from '@anthropic-ai/sdk'
import {
  AnthropicLlmClient,
  type AnthropicCreateParams,
  type AnthropicMessagesClient,
  type LlmBatchClient,
  type LlmClient,
} from '@revido/core'

export type WorkerLlmClient = LlmClient & LlmBatchClient

/** Adapt an Anthropic SDK client onto the structural surface core depends on. */
export function createAnthropicSdkAdapter(sdk: Anthropic): AnthropicMessagesClient {
  const messages = sdk.beta.messages
  return {
    async create(params) {
      return messages.create(params)
    },
    async createStream(params) {
      const streamParams: AnthropicCreateParams & { stream: true } = { ...params, stream: true }
      return messages.create(streamParams)
    },
    batches: {
      async create(requests) {
        return messages.batches.create({
          requests: requests.map((r) => ({ custom_id: r.custom_id, params: r.params })),
        })
      },
      async retrieve(batchId) {
        return messages.batches.retrieve(batchId)
      },
      async results(batchId) {
        return messages.batches.results(batchId)
      },
    },
  }
}

/** Build the caching-first LLM client. Throws if `ANTHROPIC_API_KEY` is unset. */
export function createLlmClient(env: NodeJS.ProcessEnv = process.env): WorkerLlmClient {
  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  const sdk = new Anthropic({ apiKey })
  return new AnthropicLlmClient(createAnthropicSdkAdapter(sdk))
}
