/**
 * OpenRouterLlmClient — a fetch-based {@link LlmClient} routing completions
 * through OpenRouter's OpenAI-compatible chat-completions endpoint.
 *
 * `@revido/core` carries no provider SDK dependency (the manifest is frozen), so
 * — exactly like the embeddings clients — this talks to the REST API over plain
 * `fetch`; tests inject a fake `fetch` through the constructor. OpenRouter speaks
 * the OpenAI `chat/completions` wire format, which shapes what lives here:
 *  - Messages are flat `{ role, content }` objects with the stable `system`
 *    prefix prepended as `messages[0]`. There is NO per-block cache breakpoint in
 *    the OpenAI format, so `cacheSystem` is ignored (OpenRouter/providers cache
 *    transparently); the tier→slug map and reasoning/effort shaping stay here.
 *  - Privacy is enforced PER REQUEST via `provider: { zdr: true, data_collection:
 *    'deny' }` so a zero-data-retention, no-train route is picked on every call
 *    (toggle with `enforceZdr`). `HTTP-Referer` / `X-Title` are OpenRouter app
 *    attribution, not auth.
 *  - OpenRouter has no Batches endpoint, so the {@link LlmBatchClient} methods
 *    throw — backfill must fall back to the real-time triage path.
 */

import {
  parseJsonFromText,
  type LlmBatchClient,
  type LlmBatchRequest,
  type LlmBatchResultItem,
  type LlmClient,
  type LlmCompletionRequest,
  type LlmModel,
  type LlmModelTier,
  type LlmResponseFormat,
  type LlmResult,
  type LlmStreamEvent,
  type LlmUsage,
} from './types'
import type { FetchImpl } from '../adapters/http'

/**
 * Tier → OpenRouter model slug. OpenRouter namespaces every model as
 * `provider/model`, so these differ from the Anthropic-direct ids in
 * {@link MODELS}. Overridable per-tier via {@link OpenRouterLlmClientOptions.models}.
 */
const DEFAULT_OPENROUTER_MODELS: Record<LlmModelTier, string> = {
  triage: 'openai/gpt-5-nano',
  summary: 'openai/gpt-5-nano',
  escalation: 'openai/gpt-5-mini',
}

// ---------------------------------------------------------------------------
// Narrow internal response shapes (OpenAI chat-completions wire format).
// ---------------------------------------------------------------------------

/** Usage block; OpenRouter reports cache reads under `prompt_tokens_details`. */
interface OpenRouterUsage {
  prompt_tokens?: number
  completion_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number } | null
  cache_write_tokens?: number | null
}

/** A non-streaming completion response. */
interface OpenRouterCompletion {
  model?: string
  choices?: { message?: { content?: string }; finish_reason?: string | null }[]
  usage?: OpenRouterUsage
}

/** A single streamed SSE chunk. */
interface OpenRouterStreamChunk {
  model?: string
  choices?: { delta?: { content?: string }; finish_reason?: string | null }[]
  usage?: OpenRouterUsage
}

// ---------------------------------------------------------------------------

export interface OpenRouterLlmClientOptions {
  /** OpenRouter API key (required). */
  apiKey: string
  /** API base; default `https://openrouter.ai/api/v1`. A trailing slash is stripped. */
  baseUrl?: string
  /** Per-tier slug overrides, merged on top of {@link DEFAULT_OPENROUTER_MODELS}. */
  models?: Partial<Record<LlmModelTier, string>>
  /** Force a zero-data-retention / no-train route per request (default true). */
  enforceZdr?: boolean
  /** OpenRouter app attribution, sent as `HTTP-Referer` (default `https://mail.revido.co`). */
  referer?: string
  /** OpenRouter app attribution, sent as `X-Title` (default `Revido Mail`). */
  title?: string
  /** Injected `fetch` (default `globalThis.fetch`). */
  fetchImpl?: FetchImpl
}

/** Map the request's structured-output ask to the OpenAI `response_format` field. */
function toResponseFormat(rf: LlmResponseFormat | undefined): Record<string, unknown> | undefined {
  if (rf?.type !== 'json') return undefined
  if (rf.schema) {
    return { type: 'json_schema', json_schema: { name: 'result', strict: true, schema: rf.schema } }
  }
  return { type: 'json_object' }
}

/** Map the request's thinking/effort config to OpenRouter's `reasoning` field. */
function toReasoning(req: LlmCompletionRequest): Record<string, unknown> | undefined {
  if (req.effort) return { effort: req.effort }
  if (req.thinking?.type === 'enabled') return { max_tokens: req.thinking.budgetTokens }
  if (req.thinking?.type === 'adaptive') return { enabled: true }
  return undefined
}

/** Split OpenRouter usage into the cache-aware {@link LlmUsage} the callers meter. */
function toUsage(usage: OpenRouterUsage | undefined): LlmUsage {
  const cacheReadInputTokens = usage?.prompt_tokens_details?.cached_tokens ?? 0
  return {
    inputTokens: Math.max(0, (usage?.prompt_tokens ?? 0) - cacheReadInputTokens),
    outputTokens: usage?.completion_tokens ?? 0,
    cacheReadInputTokens,
    cacheCreationInputTokens: usage?.cache_write_tokens ?? 0,
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}

/** Fetch-based OpenRouter client (OpenAI chat-completions format). */
export class OpenRouterLlmClient implements LlmClient, LlmBatchClient {
  private readonly apiKey: string
  private readonly endpoint: string
  private readonly models: Record<LlmModelTier, string>
  private readonly enforceZdr: boolean
  private readonly referer: string
  private readonly title: string
  private readonly fetchImpl: FetchImpl

  constructor(opts: OpenRouterLlmClientOptions) {
    if (!opts.apiKey) throw new Error('OpenRouterLlmClient: apiKey is required')
    this.apiKey = opts.apiKey
    const baseUrl = (opts.baseUrl ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '')
    this.endpoint = `${baseUrl}/chat/completions`
    this.models = { ...DEFAULT_OPENROUTER_MODELS, ...(opts.models ?? {}) }
    this.enforceZdr = opts.enforceZdr ?? true
    this.referer = opts.referer ?? 'https://mail.revido.co'
    this.title = opts.title ?? 'Revido Mail'
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchImpl)
  }

  /** Tier keyword → configured slug; a raw slug passes through unchanged. */
  private resolveSlug(model: LlmModel): string {
    return Object.prototype.hasOwnProperty.call(this.models, model)
      ? this.models[model as LlmModelTier]
      : model
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      authorization: `Bearer ${this.apiKey}`,
    }
    if (this.referer) headers['HTTP-Referer'] = this.referer
    if (this.title) headers['X-Title'] = this.title
    return headers
  }

  /** Build the OpenAI-format request body (shared by complete + stream). */
  private buildBody(req: LlmCompletionRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.resolveSlug(req.model),
      messages: [
        { role: 'system', content: req.system },
        ...req.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      max_tokens: req.maxTokens,
    }
    if (typeof req.temperature === 'number') body.temperature = req.temperature
    if (req.stopSequences?.length) body.stop = req.stopSequences
    if (req.userId) body.user = req.userId
    const responseFormat = toResponseFormat(req.responseFormat)
    if (responseFormat) body.response_format = responseFormat
    const reasoning = toReasoning(req)
    if (reasoning) body.reasoning = reasoning
    if (this.enforceZdr) body.provider = { zdr: true, data_collection: 'deny' }
    return body
  }

  async complete(req: LlmCompletionRequest): Promise<LlmResult> {
    const res = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(this.buildBody(req)),
    })
    if (!res.ok) {
      throw new Error(`OpenRouter completion failed: ${res.status} ${await safeText(res)}`)
    }
    const json = (await res.json()) as OpenRouterCompletion
    const text = json.choices?.[0]?.message?.content ?? ''
    const result: LlmResult = {
      text,
      usage: toUsage(json.usage),
      stopReason: json.choices?.[0]?.finish_reason ?? null,
      model: json.model ?? this.resolveSlug(req.model),
    }
    if (req.responseFormat?.type === 'json') result.json = parseJsonFromText(text)
    return result
  }

  async *stream(req: LlmCompletionRequest): AsyncIterable<LlmStreamEvent> {
    const res = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: this.headers(),
      // `usage: { include: true }` makes OpenRouter emit a final usage-bearing chunk.
      body: JSON.stringify({ ...this.buildBody(req), stream: true, usage: { include: true } }),
    })
    if (!res.ok) {
      throw new Error(`OpenRouter streaming failed: ${res.status} ${await safeText(res)}`)
    }
    if (!res.body) throw new Error('OpenRouter streaming response had no body')

    let model = this.resolveSlug(req.model)
    let stopReason: string | null = null
    let usage: LlmUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const s = line.trim()
        // Skip blanks and SSE comment / keep-alive lines (`: OPENROUTER PROCESSING`).
        if (!s || s.startsWith(':')) continue
        if (!s.startsWith('data:')) continue
        const data = s.slice(5).trim()
        if (data === '[DONE]') continue
        let chunk: OpenRouterStreamChunk
        try {
          chunk = JSON.parse(data) as OpenRouterStreamChunk
        } catch {
          continue
        }
        if (chunk.model) model = chunk.model
        const choice = chunk.choices?.[0]
        if (choice?.delta?.content) yield { type: 'text', text: choice.delta.content }
        if (choice?.finish_reason) stopReason = choice.finish_reason
        if (chunk.usage) usage = toUsage(chunk.usage)
      }
    }
    yield { type: 'done', stopReason, usage, model }
  }

  // -------------------------------------------------------------------------
  // Batches — unsupported on OpenRouter.
  // -------------------------------------------------------------------------

  private batchesUnsupported(): never {
    throw new Error(
      'Batches are not supported on OpenRouter — set ANTHROPIC_BATCHES_DISABLED=true so backfill uses the real-time triage path.',
    )
  }

  async submitBatch(_requests: LlmBatchRequest[]): Promise<{ batchId: string }> {
    return this.batchesUnsupported()
  }

  async pollBatch(_batchId: string): Promise<{ status: 'in_progress' | 'canceling' | 'ended' }> {
    return this.batchesUnsupported()
  }

  async collectBatch(
    _batchId: string,
    _opts?: { pollIntervalMs?: number; signal?: AbortSignal },
  ): Promise<Map<string, LlmBatchResultItem>> {
    return this.batchesUnsupported()
  }
}
