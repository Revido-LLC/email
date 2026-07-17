/**
 * The API's AI clients — a lazily-constructed, injectable {@link LlmClient} and
 * {@link EmbeddingsClient}.
 *
 * The AI routes (`/ai/*`, `/agents/compile`) call {@link getLlmClient} /
 * {@link getEmbeddingsClient} at request time rather than constructing a client
 * at module load, so importing a router never requires `ANTHROPIC_API_KEY` /
 * `VOYAGE_API_KEY`. The real Anthropic client is wired exactly as the worker does
 * (`apps/worker/src/llm.ts`): construct the `@anthropic-ai/sdk` client and adapt
 * its `beta.messages` surface onto the structural {@link AnthropicMessagesClient}
 * that `@revido/core` depends on. Tests inject a `FakeLlmClient` /
 * `FakeEmbeddingsClient` via {@link setLlmClient} / {@link setEmbeddingsClient}.
 */
import Anthropic from '@anthropic-ai/sdk'
import {
  AnthropicLlmClient,
  createEmbeddingsClient,
  type AnthropicCreateParams,
  type AnthropicMessagesClient,
  type EmbeddingsClient,
  type LlmClient,
} from '@revido/core'

/** Adapt an Anthropic SDK client onto the structural surface core depends on. */
function createAnthropicSdkAdapter(sdk: Anthropic): AnthropicMessagesClient {
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

/** Build the Anthropic-direct LLM client. Throws if `ANTHROPIC_API_KEY` is unset. */
export function createApiLlmClient(env: NodeJS.ProcessEnv = process.env): LlmClient {
  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  const sdk = new Anthropic({ apiKey })
  return new AnthropicLlmClient(createAnthropicSdkAdapter(sdk))
}

let llmOverride: LlmClient | undefined
let cachedLlm: LlmClient | undefined

/** Override the LLM client (tests inject a `FakeLlmClient`; pass `undefined` to reset). */
export function setLlmClient(client: LlmClient | undefined): void {
  llmOverride = client
}

/** The process-wide LLM client (lazy real client, or the test override). */
export function getLlmClient(env: NodeJS.ProcessEnv = process.env): LlmClient {
  if (llmOverride) return llmOverride
  if (!cachedLlm) cachedLlm = createApiLlmClient(env)
  return cachedLlm
}

let embeddingsOverride: EmbeddingsClient | undefined
let cachedEmbeddings: EmbeddingsClient | undefined

/** Override the embeddings client (tests inject a `FakeEmbeddingsClient`). */
export function setEmbeddingsClient(client: EmbeddingsClient | undefined): void {
  embeddingsOverride = client
}

/** The process-wide embeddings client (lazy real client, or the test override). */
export function getEmbeddingsClient(env: NodeJS.ProcessEnv = process.env): EmbeddingsClient {
  if (embeddingsOverride) return embeddingsOverride
  if (!cachedEmbeddings) cachedEmbeddings = createEmbeddingsClient(env)
  return cachedEmbeddings
}
