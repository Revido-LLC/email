/**
 * AnthropicLlmClient — the Anthropic-direct {@link LlmClient} implementation.
 *
 * `@revido/core` cannot depend on `@anthropic-ai/sdk` (it is not a declared
 * dependency and the package manifest is frozen), so this client is written
 * against a MINIMAL STRUCTURAL surface — {@link AnthropicMessagesClient} — that
 * mirrors just the `beta.messages` create/stream/batches methods it uses. The
 * worker constructs the real SDK client (reading `ANTHROPIC_API_KEY`) and injects
 * an adapter that satisfies this surface. This keeps the request-shaping logic —
 * prompt-cache breakpoints, tier→id mapping, explicit thinking, Batches keying —
 * here in core, unit-tested against a mock, and provider-portable.
 *
 * Request shaping that lives here (verified against the Anthropic API):
 *  - `cache_control: { type: 'ephemeral' }` is set on the stable system block so
 *    the frozen prefix is billed once per session, not once per message.
 *  - Tiers map to the baked-in ids via {@link MODELS}; a raw id passes through.
 *  - `thinking` is always sent explicitly; omitting it sends `{ type: 'disabled' }`
 *    so a thinking-by-default model (Sonnet) never spends by accident.
 *  - Batches submit unordered and are collected into a `customId`-keyed map.
 */

import {
  parseJsonFromText,
  resolveModel,
  type LlmBatchClient,
  type LlmBatchRequest,
  type LlmBatchResultItem,
  type LlmClient,
  type LlmCompletionRequest,
  type LlmResult,
  type LlmStreamEvent,
  type LlmThinking,
  type LlmUsage,
} from './types'

// ---------------------------------------------------------------------------
// Structural SDK surface (field names match the Anthropic wire format so the
// worker adapter can forward params to `client.beta.messages.*` unchanged).
// ---------------------------------------------------------------------------

/** Wire-shaped thinking config passed to the Anthropic API. */
export type AnthropicThinkingParam =
  | { type: 'disabled' }
  | { type: 'adaptive'; display?: 'summarized' | 'omitted' }
  | { type: 'enabled'; budget_tokens: number }

/** A system/content text block, optionally carrying a cache breakpoint. */
export interface AnthropicTextBlockParam {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' } | null
}

/** One message turn (text content only). */
export interface AnthropicMessageParam {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Create-message parameters. `thinking` / `output_config` are newer API fields
 * not present in every SDK type version; they are carried here and serialized
 * into the request body by the injected adapter.
 */
export interface AnthropicCreateParams {
  model: string
  max_tokens: number
  system?: AnthropicTextBlockParam[]
  messages: AnthropicMessageParam[]
  stop_sequences?: string[]
  temperature?: number
  metadata?: { user_id?: string }
  thinking?: AnthropicThinkingParam
  output_config?: Record<string, unknown>
}

/** Token usage as returned by the API (cache fields may be null/absent). */
export interface AnthropicUsageLike {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

/** A returned content block (only `text` blocks are consumed). */
export interface AnthropicContentBlock {
  type: string
  text?: string
}

/** A completed message response. */
export interface AnthropicMessage {
  content: AnthropicContentBlock[]
  stop_reason: string | null
  model: string
  usage: AnthropicUsageLike
}

/** A single streaming event (permissive superset of the SDK's event union). */
export interface AnthropicStreamEvent {
  type: string
  message?: { model?: string; usage?: AnthropicUsageLike }
  delta?: { type?: string; text?: string; stop_reason?: string | null }
  usage?: { output_tokens?: number }
}

/** One Batches request item. */
export interface AnthropicBatchRequestItem {
  custom_id: string
  params: AnthropicCreateParams
}

/** One Batches result item (result shape kept loose across statuses). */
export interface AnthropicBatchResultItem {
  custom_id: string
  result: { type: string; message?: AnthropicMessage; error?: unknown }
}

/** The Batches sub-surface. */
export interface AnthropicBatchesClient {
  create(requests: AnthropicBatchRequestItem[]): Promise<{ id: string }>
  retrieve(batchId: string): Promise<{ processing_status: string }>
  results(batchId: string): Promise<AsyncIterable<AnthropicBatchResultItem>>
}

/** The minimal `beta.messages` surface {@link AnthropicLlmClient} depends on. */
export interface AnthropicMessagesClient {
  create(params: AnthropicCreateParams): Promise<AnthropicMessage>
  createStream(params: AnthropicCreateParams): Promise<AsyncIterable<AnthropicStreamEvent>>
  batches: AnthropicBatchesClient
}

// ---------------------------------------------------------------------------

export interface AnthropicLlmClientOptions {
  /** Default poll interval (ms) for {@link LlmBatchClient.collectBatch}. */
  batchPollIntervalMs?: number
}

const DEFAULT_BATCH_POLL_MS = 15_000

/** Map the public thinking config to the wire shape. Default: disabled. */
function toThinkingParam(thinking: LlmThinking | undefined): AnthropicThinkingParam {
  if (!thinking) return { type: 'disabled' }
  switch (thinking.type) {
    case 'adaptive':
      return thinking.display
        ? { type: 'adaptive', display: thinking.display }
        : { type: 'adaptive' }
    case 'enabled':
      return { type: 'enabled', budget_tokens: thinking.budgetTokens }
    case 'disabled':
      return { type: 'disabled' }
  }
}

function toUsage(usage: AnthropicUsageLike | undefined): LlmUsage {
  return {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheReadInputTokens: usage?.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: usage?.cache_creation_input_tokens ?? 0,
  }
}

/** Build the wire params for a completion request (shared by complete/stream/batch). */
export function buildCreateParams(req: LlmCompletionRequest): AnthropicCreateParams {
  const systemBlock: AnthropicTextBlockParam = { type: 'text', text: req.system }
  if (req.cacheSystem ?? true) systemBlock.cache_control = { type: 'ephemeral' }

  const output: Record<string, unknown> = {}
  if (req.effort) output.effort = req.effort
  if (req.responseFormat?.type === 'json' && req.responseFormat.schema) {
    output.format = { type: 'json_schema', schema: req.responseFormat.schema }
  }

  const params: AnthropicCreateParams = {
    model: resolveModel(req.model),
    max_tokens: req.maxTokens,
    system: [systemBlock],
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    thinking: toThinkingParam(req.thinking),
  }
  if (req.stopSequences?.length) params.stop_sequences = req.stopSequences
  if (typeof req.temperature === 'number') params.temperature = req.temperature
  if (req.userId) params.metadata = { user_id: req.userId }
  if (Object.keys(output).length) params.output_config = output
  return params
}

function messageText(msg: AnthropicMessage): string {
  return msg.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
}

function toResult(msg: AnthropicMessage, req: LlmCompletionRequest): LlmResult {
  const text = messageText(msg)
  const result: LlmResult = {
    text,
    usage: toUsage(msg.usage),
    stopReason: msg.stop_reason,
    model: msg.model,
  }
  if (req.responseFormat?.type === 'json') result.json = parseJsonFromText(text)
  return result
}

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new Error('aborted'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Anthropic-direct client. Injected with a {@link AnthropicMessagesClient} adapter. */
export class AnthropicLlmClient implements LlmClient, LlmBatchClient {
  private readonly client: AnthropicMessagesClient
  private readonly batchPollIntervalMs: number

  constructor(client: AnthropicMessagesClient, options: AnthropicLlmClientOptions = {}) {
    this.client = client
    this.batchPollIntervalMs = options.batchPollIntervalMs ?? DEFAULT_BATCH_POLL_MS
  }

  async complete(req: LlmCompletionRequest): Promise<LlmResult> {
    const msg = await this.client.create(buildCreateParams(req))
    return toResult(msg, req)
  }

  async *stream(req: LlmCompletionRequest): AsyncIterable<LlmStreamEvent> {
    const events = await this.client.createStream(buildCreateParams(req))
    let model = resolveModel(req.model)
    let stopReason: string | null = null
    const usage: LlmUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    }
    for await (const event of events) {
      if (event.type === 'message_start' && event.message) {
        if (event.message.model) model = event.message.model
        Object.assign(usage, toUsage(event.message.usage))
      } else if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        yield { type: 'text', text: event.delta.text ?? '' }
      } else if (event.type === 'message_delta') {
        if (event.delta?.stop_reason !== undefined && event.delta.stop_reason !== null) {
          stopReason = event.delta.stop_reason
        }
        if (typeof event.usage?.output_tokens === 'number') {
          usage.outputTokens = event.usage.output_tokens
        }
      }
    }
    yield { type: 'done', stopReason, usage, model }
  }

  async submitBatch(requests: LlmBatchRequest[]): Promise<{ batchId: string }> {
    const items: AnthropicBatchRequestItem[] = requests.map((r) => ({
      custom_id: r.customId,
      params: buildCreateParams(r.request),
    }))
    const batch = await this.client.batches.create(items)
    return { batchId: batch.id }
  }

  async pollBatch(
    batchId: string,
  ): Promise<{ status: 'in_progress' | 'canceling' | 'ended' }> {
    const batch = await this.client.batches.retrieve(batchId)
    const status = batch.processing_status
    if (status === 'in_progress' || status === 'canceling' || status === 'ended') {
      return { status }
    }
    // Unknown status ⇒ treat as still working so callers keep polling.
    return { status: 'in_progress' }
  }

  async collectBatch(
    batchId: string,
    opts: { pollIntervalMs?: number; signal?: AbortSignal } = {},
  ): Promise<Map<string, LlmBatchResultItem>> {
    const interval = opts.pollIntervalMs ?? this.batchPollIntervalMs
    for (;;) {
      const { status } = await this.pollBatch(batchId)
      if (status === 'ended') break
      await delay(interval, opts.signal)
    }
    const out = new Map<string, LlmBatchResultItem>()
    const results = await this.client.batches.results(batchId)
    for await (const item of results) {
      out.set(item.custom_id, toBatchResultItem(item))
    }
    return out
  }
}

function toBatchResultItem(item: AnthropicBatchResultItem): LlmBatchResultItem {
  const type = item.result.type
  if (type === 'succeeded' && item.result.message) {
    const msg = item.result.message
    return {
      customId: item.custom_id,
      status: 'succeeded',
      result: {
        text: messageText(msg),
        usage: toUsage(msg.usage),
        stopReason: msg.stop_reason,
        model: msg.model,
      },
    }
  }
  const status: LlmBatchResultItem['status'] =
    type === 'errored' || type === 'canceled' || type === 'expired' ? type : 'errored'
  const out: LlmBatchResultItem = { customId: item.custom_id, status }
  if (item.result.error !== undefined) out.error = JSON.stringify(item.result.error)
  return out
}
