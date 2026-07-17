/**
 * LlmClient — the caching-first, provider-agnostic LLM contract (W5/W6/W7).
 *
 * A narrow seam every enrichment path (triage, summary, extraction) and the
 * Wave-3 chat SSE endpoint call through. The shape is deliberately provider-free:
 * `AnthropicLlmClient` is the only implementation now, but a cheap-triage adapter
 * (Gemini/Fireworks/Groq) or a BYOK client can drop in behind the same interface.
 *
 * Design rules baked in here:
 *  - The `system` prefix is a STABLE, user-data-free string flagged for prompt
 *    caching; the volatile per-request content lives in `messages` (see
 *    `@revido/core` prompt builders, which already split their output this way).
 *  - `thinking` is EXPLICIT. Omitting it defaults to disabled so that spend on a
 *    model that thinks-by-default (Sonnet) is always a deliberate choice.
 *  - `usage` surfaces the cache read/creation token counts so callers can meter
 *    the prompt-cache discount.
 */

/** Logical model tiers → concrete Anthropic model ids (see {@link MODELS}). */
export type LlmModelTier = 'triage' | 'summary' | 'escalation'

/**
 * Tier → model id. Baked-in decision (Anthropic-direct):
 *  - triage      → Haiku 4.5  (high-volume, cheap; caches the ≥4096-token prefix)
 *  - summary     → Sonnet 5   (summary / extraction; thinking OFF unless asked)
 *  - escalation  → Opus 4.8   (hard-case escalation / reserve)
 */
export const MODELS: Record<LlmModelTier, string> = {
  triage: 'claude-haiku-4-5',
  summary: 'claude-sonnet-5',
  escalation: 'claude-opus-4-8',
}

/** A model tier keyword or a raw model id passed straight through. */
export type LlmModel = LlmModelTier | (string & {})

/** Resolve a tier keyword to its model id; a raw id passes through unchanged. */
export function resolveModel(model: LlmModel): string {
  return Object.prototype.hasOwnProperty.call(MODELS, model)
    ? MODELS[model as LlmModelTier]
    : model
}

/**
 * Explicit thinking configuration.
 *  - `disabled`  — no thinking (the default; keeps cost a choice).
 *  - `adaptive`  — model decides depth (Sonnet 5 / Opus 4.8). `display` controls
 *    whether summarized reasoning is returned.
 *  - `enabled`   — fixed budget for legacy/older models.
 */
export type LlmThinking =
  | { type: 'disabled' }
  | { type: 'adaptive'; display?: 'summarized' | 'omitted' }
  | { type: 'enabled'; budgetTokens: number }

/** Effort levels (Sonnet 5 / Opus 4.8; unsupported on Haiku — leave unset there). */
export type LlmEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** One conversation turn. Content is plain text; images/tools are out of scope here. */
export interface LlmMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Request the caller wants a strict-JSON result. When set, the response text is
 * parsed into {@link LlmResult.json}; an optional `schema` is forwarded as a
 * structured-output constraint for providers that support it.
 */
export interface LlmResponseFormat {
  type: 'json'
  /** JSON Schema forwarded as a structured-output constraint (best effort). */
  schema?: Record<string, unknown>
}

/** A single non-streaming / streaming completion request. */
export interface LlmCompletionRequest {
  /** Tier keyword or raw model id. */
  model: LlmModel
  /**
   * STABLE, cacheable system prefix. Must be user-data-free so the prompt cache
   * stays warm system-wide.
   */
  system: string
  /** Attach a cache breakpoint to the system prefix (default true). */
  cacheSystem?: boolean
  messages: LlmMessage[]
  maxTokens: number
  /** Explicit; omitted ⇒ `{ type: 'disabled' }`. */
  thinking?: LlmThinking
  /** Sonnet/Opus only. */
  effort?: LlmEffort
  /** Ask for strict JSON (parses the response into `json`). */
  responseFormat?: LlmResponseFormat
  /** Optional sampling temperature (omitted by default). */
  temperature?: number
  stopSequences?: string[]
  /** Opaque per-user tag for provider-side abuse tracking (never mailbox content). */
  userId?: string
}

/** Token accounting, including the prompt-cache read/creation split. */
export interface LlmUsage {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
}

/** Result of a non-streaming completion. */
export interface LlmResult {
  text: string
  /** Present when `responseFormat.type === 'json'` and parsing succeeded. */
  json?: unknown
  usage: LlmUsage
  /** Provider stop reason (kept loose for forward-compat, e.g. 'refusal'). */
  stopReason: string | null
  /** The concrete model id that produced this result. */
  model: string
}

/** Streaming event surface consumed by the Wave-3 SSE endpoint. */
export type LlmStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'done'; stopReason: string | null; usage: LlmUsage; model: string }

/** The non-streaming + streaming completion contract. */
export interface LlmClient {
  complete(req: LlmCompletionRequest): Promise<LlmResult>
  stream(req: LlmCompletionRequest): AsyncIterable<LlmStreamEvent>
}

/** One request in a Batches submission, keyed by a caller-chosen id. */
export interface LlmBatchRequest {
  customId: string
  request: LlmCompletionRequest
}

/** A single Batches result, keyed back to its `customId`. */
export interface LlmBatchResultItem {
  customId: string
  status: 'succeeded' | 'errored' | 'canceled' | 'expired'
  result?: LlmResult
  error?: string
}

/** Batches API surface: submit unordered, poll until ended, key by `customId`. */
export interface LlmBatchClient {
  submitBatch(requests: LlmBatchRequest[]): Promise<{ batchId: string }>
  pollBatch(batchId: string): Promise<{ status: 'in_progress' | 'canceling' | 'ended' }>
  /**
   * Poll until the batch has `ended`, then collect every result keyed by
   * `customId`. Results arrive UNORDERED, so the map — not position — is the
   * source of truth.
   */
  collectBatch(
    batchId: string,
    opts?: { pollIntervalMs?: number; signal?: AbortSignal },
  ): Promise<Map<string, LlmBatchResultItem>>
}

/**
 * Robustly extract a JSON value from model text. Tries a whole-string parse
 * first, then falls back to the outermost `{…}` / `[…]` span (models sometimes
 * wrap JSON in prose or a code fence even when asked not to).
 */
export function parseJsonFromText(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    // fall through to span extraction
  }
  const start = trimmed.search(/[[{]/)
  if (start === -1) return undefined
  const open = trimmed[start]
  const close = open === '{' ? '}' : ']'
  const end = trimmed.lastIndexOf(close)
  if (end <= start) return undefined
  try {
    return JSON.parse(trimmed.slice(start, end + 1))
  } catch {
    return undefined
  }
}
