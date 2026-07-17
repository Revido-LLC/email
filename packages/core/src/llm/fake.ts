/**
 * FakeLlmClient — a deterministic {@link LlmClient} for tests and as the
 * canonical example of the pluggable seam (any provider or a stub can sit behind
 * the same interface).
 *
 * It records every request (`calls`), returns caller-supplied or deterministic
 * text, and — when `responseFormat` is JSON — parses that text into
 * {@link LlmResult.json}. The default responder emits a valid triage-shaped JSON
 * object for JSON requests and an echo string otherwise, so higher-level
 * enrichment tests get useful output with no wiring.
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
  type LlmUsage,
} from './types'

const ZERO_USAGE: LlmUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
}

/** A deterministic, triage-shaped JSON payload used as the default JSON response. */
const DEFAULT_TRIAGE_JSON = JSON.stringify({
  category: 'fyi',
  priorityScore: 40,
  priority: 'normal',
  tldr: 'Deterministic fake triage result.',
  language: 'en',
})

export interface FakeLlmClientOptions {
  /**
   * Produce the response text for a request. Defaults to a triage-shaped JSON
   * object for JSON requests and an echo of the last user turn otherwise.
   */
  respond?: (req: LlmCompletionRequest) => string
  /** Usage returned on every result (defaults to all-zero). */
  usage?: Partial<LlmUsage>
  /** Stop reason returned on every result (defaults to 'end_turn'). */
  stopReason?: string | null
}

function defaultRespond(req: LlmCompletionRequest): string {
  if (req.responseFormat?.type === 'json') return DEFAULT_TRIAGE_JSON
  const lastUser = [...req.messages].reverse().find((m) => m.role === 'user')
  return lastUser ? `FAKE: ${lastUser.content}` : 'FAKE'
}

export class FakeLlmClient implements LlmClient, LlmBatchClient {
  /** Every request seen, in order — assert against this in tests. */
  readonly calls: LlmCompletionRequest[] = []
  private readonly respond: (req: LlmCompletionRequest) => string
  private readonly usage: LlmUsage
  private readonly stopReason: string | null

  constructor(options: FakeLlmClientOptions = {}) {
    this.respond = options.respond ?? defaultRespond
    this.usage = { ...ZERO_USAGE, ...options.usage }
    this.stopReason = options.stopReason ?? 'end_turn'
  }

  private buildResult(req: LlmCompletionRequest): LlmResult {
    const text = this.respond(req)
    const result: LlmResult = {
      text,
      usage: { ...this.usage },
      stopReason: this.stopReason,
      model: resolveModel(req.model),
    }
    if (req.responseFormat?.type === 'json') result.json = parseJsonFromText(text)
    return result
  }

  async complete(req: LlmCompletionRequest): Promise<LlmResult> {
    this.calls.push(req)
    return this.buildResult(req)
  }

  async *stream(req: LlmCompletionRequest): AsyncIterable<LlmStreamEvent> {
    this.calls.push(req)
    const result = this.buildResult(req)
    yield { type: 'text', text: result.text }
    yield {
      type: 'done',
      stopReason: result.stopReason,
      usage: result.usage,
      model: result.model,
    }
  }

  async submitBatch(requests: LlmBatchRequest[]): Promise<{ batchId: string }> {
    for (const r of requests) this.calls.push(r.request)
    this.batches.set('fake-batch', requests)
    return { batchId: 'fake-batch' }
  }

  async pollBatch(_batchId: string): Promise<{ status: 'in_progress' | 'canceling' | 'ended' }> {
    return { status: 'ended' }
  }

  async collectBatch(batchId: string): Promise<Map<string, LlmBatchResultItem>> {
    const requests = this.batches.get(batchId) ?? []
    const out = new Map<string, LlmBatchResultItem>()
    for (const r of requests) {
      out.set(r.customId, {
        customId: r.customId,
        status: 'succeeded',
        result: this.buildResult(r.request),
      })
    }
    return out
  }

  private readonly batches = new Map<string, LlmBatchRequest[]>()
}
