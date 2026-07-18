/**
 * The worker's LLM wiring — the one place that constructs the model backend.
 *
 * The backend is **OpenRouter** (OpenAI chat-completions format), selected by
 * `OPENROUTER_API_KEY`. It fronts any model per tier via `LLM_MODEL_TRIAGE` /
 * `LLM_MODEL_SUMMARY` / `LLM_MODEL_ESCALATION`, and ZDR / no-training is enforced
 * per request through the `provider` field (`OPENROUTER_ENFORCE_ZDR`, default on).
 * OpenRouter has **no Batches endpoint**, so `ANTHROPIC_BATCHES_DISABLED=true` must
 * be set — `apps/worker/src/context.ts:isBatchTriageEnabled` then routes backfill
 * through the real-time triage path (the throwing batch methods on
 * {@link OpenRouterLlmClient} are the safety net).
 */

import {
  OpenRouterLlmClient,
  type LlmBatchClient,
  type LlmClient,
  type LlmModelTier,
} from '@revido/core'

export type WorkerLlmClient = LlmClient & LlmBatchClient

/** Read per-tier model overrides from env (LLM_MODEL_TRIAGE/SUMMARY/ESCALATION). */
function modelMapFromEnv(env: NodeJS.ProcessEnv): Partial<Record<LlmModelTier, string>> {
  const map: Partial<Record<LlmModelTier, string>> = {}
  if (env.LLM_MODEL_TRIAGE) map.triage = env.LLM_MODEL_TRIAGE
  if (env.LLM_MODEL_SUMMARY) map.summary = env.LLM_MODEL_SUMMARY
  if (env.LLM_MODEL_ESCALATION) map.escalation = env.LLM_MODEL_ESCALATION
  return map
}

/** Build the caching-first LLM client. OpenRouter is the sole backend. */
export function createLlmClient(env: NodeJS.ProcessEnv = process.env): WorkerLlmClient {
  const apiKey = env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set (the LLM backend)')
  return new OpenRouterLlmClient({
    apiKey,
    models: modelMapFromEnv(env),
    enforceZdr: env.OPENROUTER_ENFORCE_ZDR !== 'false',
  })
}
