/**
 * The API's AI clients — a lazily-constructed, injectable {@link LlmClient} and
 * {@link EmbeddingsClient}.
 *
 * The AI routes (`/ai/*`, `/agents/compile`) call {@link getLlmClient} /
 * {@link getEmbeddingsClient} at request time rather than constructing a client
 * at module load, so importing a router never requires an LLM key /
 * `VOYAGE_API_KEY`. The LLM backend is **OpenRouter** (OpenAI chat-completions
 * format), selected by `OPENROUTER_API_KEY` and wired exactly as the worker does
 * (`apps/worker/src/llm.ts`): any model per tier via `LLM_MODEL_TRIAGE` /
 * `LLM_MODEL_SUMMARY` / `LLM_MODEL_ESCALATION`, with ZDR / no-training enforced per
 * request through the `provider` field (`OPENROUTER_ENFORCE_ZDR`, default on).
 *
 * Tests inject a `FakeLlmClient` / `FakeEmbeddingsClient` via {@link setLlmClient} /
 * {@link setEmbeddingsClient}.
 */
import {
  OpenRouterLlmClient,
  createEmbeddingsClient,
  type EmbeddingsClient,
  type LlmClient,
  type LlmModelTier,
} from '@revido/core'

/** Read per-tier model overrides from env (LLM_MODEL_TRIAGE/SUMMARY/ESCALATION). */
function modelMapFromEnv(env: NodeJS.ProcessEnv): Partial<Record<LlmModelTier, string>> {
  const map: Partial<Record<LlmModelTier, string>> = {}
  if (env.LLM_MODEL_TRIAGE) map.triage = env.LLM_MODEL_TRIAGE
  if (env.LLM_MODEL_SUMMARY) map.summary = env.LLM_MODEL_SUMMARY
  if (env.LLM_MODEL_ESCALATION) map.escalation = env.LLM_MODEL_ESCALATION
  return map
}

/** Build the LLM client. OpenRouter is the sole backend. */
export function createApiLlmClient(env: NodeJS.ProcessEnv = process.env): LlmClient {
  const apiKey = env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set (the LLM backend)')
  return new OpenRouterLlmClient({
    apiKey,
    models: modelMapFromEnv(env),
    enforceZdr: env.OPENROUTER_ENFORCE_ZDR !== 'false',
  })
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
