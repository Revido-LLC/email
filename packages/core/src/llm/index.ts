/**
 * @revido/core/llm — the caching-first, provider-agnostic LLM seam.
 *
 * `LlmClient` (interface + request/result types), `AnthropicLlmClient` (the
 * Anthropic-direct implementation over an injected structural SDK surface), and
 * `FakeLlmClient` (deterministic, for tests + the pluggable-seam example).
 */

export * from './types'
export * from './anthropic'
export * from './fake'
