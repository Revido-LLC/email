/**
 * EmbeddingsClient — the multilingual embedding seam (W7).
 *
 * Anthropic has no embeddings model, so retrieval uses an external provider.
 * Default is Voyage multilingual (strong on Dutch, 1024-dim to match the
 * `message_embeddings.embedding` pgvector column); OpenAI `text-embedding-3-large`
 * (pinned to 1024 dims) is the fallback. Both are called over plain `fetch` so
 * `@revido/core` needs no provider SDK dependency.
 *
 * Consumed by BOTH `apps/api` (embed the chat query at request time) and
 * `apps/worker` (embed messages on ingest). Require a no-retention / no-train
 * agreement with whichever provider is used, to preserve the privacy promise.
 */
import type { FetchImpl } from '../adapters/http'

/** Voyage/OpenAI distinguish query vs document embeddings; passthrough where supported. */
export type EmbeddingInputType = 'query' | 'document'

export interface EmbeddingsClient {
  readonly model: string
  readonly dimensions: number
  /** Embed each input; returns one vector per input, in input order. */
  embed(texts: string[], opts?: { inputType?: EmbeddingInputType }): Promise<number[][]>
}

const VOYAGE_ENDPOINT = 'https://api.voyageai.com/v1/embeddings'
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/embeddings'
const DEFAULT_DIMENSIONS = 1024

/**
 * Thrown when a provider rejects with a retryable capacity signal (HTTP 429 rate
 * limit / 529 overloaded). Callers can catch this to back off and retry LATER
 * without treating it as a permanent failure — e.g. the embed consumer defers the
 * job instead of dead-lettering, so a throttled free-tier key self-paces rather
 * than losing coverage.
 */
export class EmbeddingsRateLimitError extends Error {
  constructor(
    readonly status: number,
    readonly provider: string,
    body: string,
  ) {
    super(`${provider} embeddings rate-limited (${status}): ${body.slice(0, 200)}`)
    this.name = 'EmbeddingsRateLimitError'
  }
}

/** 429 (rate limit) and 529 (overloaded) are transient capacity signals, not hard failures. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 529
}

interface ProviderResponse {
  data: { embedding: number[]; index: number }[]
}

/** Order-preserving parse (providers may return `data` out of order; key by `index`). */
function orderedVectors(json: ProviderResponse, expected: number): number[][] {
  const out: number[][] = new Array(expected)
  for (const row of json.data) out[row.index] = row.embedding
  return out
}

export interface VoyageOptions {
  apiKey?: string
  model?: string
  dimensions?: number
  fetchImpl?: FetchImpl
}

/** Voyage multilingual embeddings (default `voyage-3`, 1024-dim). */
export class VoyageEmbeddingsClient implements EmbeddingsClient {
  readonly model: string
  readonly dimensions: number
  private readonly apiKey: string
  private readonly fetchImpl: FetchImpl

  constructor(opts: VoyageOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.VOYAGE_API_KEY
    if (!apiKey) throw new Error('VoyageEmbeddingsClient: VOYAGE_API_KEY is not set')
    this.apiKey = apiKey
    this.model = opts.model ?? 'voyage-3'
    this.dimensions = opts.dimensions ?? DEFAULT_DIMENSIONS
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchImpl)
  }

  async embed(texts: string[], opts?: { inputType?: EmbeddingInputType }): Promise<number[][]> {
    if (texts.length === 0) return []
    const res = await this.fetchImpl(VOYAGE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      // voyage-3 is natively 1024-dim; do not send an output dimension override.
      body: JSON.stringify({
        input: texts,
        model: this.model,
        input_type: opts?.inputType ?? 'document',
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      if (isRetryableStatus(res.status)) throw new EmbeddingsRateLimitError(res.status, 'Voyage', body)
      throw new Error(`Voyage embeddings failed: ${res.status} ${body}`)
    }
    return orderedVectors((await res.json()) as ProviderResponse, texts.length)
  }
}

export interface OpenAiEmbeddingsOptions {
  apiKey?: string
  model?: string
  dimensions?: number
  fetchImpl?: FetchImpl
}

/** OpenAI `text-embedding-3-large`, pinned to 1024 dims to match the schema. */
export class OpenAiEmbeddingsClient implements EmbeddingsClient {
  readonly model: string
  readonly dimensions: number
  private readonly apiKey: string
  private readonly fetchImpl: FetchImpl

  constructor(opts: OpenAiEmbeddingsOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OpenAiEmbeddingsClient: OPENAI_API_KEY is not set')
    this.apiKey = apiKey
    this.model = opts.model ?? 'text-embedding-3-large'
    this.dimensions = opts.dimensions ?? DEFAULT_DIMENSIONS
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchImpl)
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []
    const res = await this.fetchImpl(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ input: texts, model: this.model, dimensions: this.dimensions }),
    })
    if (!res.ok) {
      const body = await res.text()
      if (isRetryableStatus(res.status)) throw new EmbeddingsRateLimitError(res.status, 'OpenAI', body)
      throw new Error(`OpenAI embeddings failed: ${res.status} ${body}`)
    }
    return orderedVectors((await res.json()) as ProviderResponse, texts.length)
  }
}

/**
 * Deterministic fake for tests + local dev — a hashed, L2-normalized vector, so
 * identical text yields identical vectors and cosine similarity is meaningful.
 */
export class FakeEmbeddingsClient implements EmbeddingsClient {
  readonly model = 'fake'
  readonly dimensions: number
  constructor(dimensions = DEFAULT_DIMENSIONS) {
    this.dimensions = dimensions
  }
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => {
      const v = new Array(this.dimensions).fill(0)
      for (let i = 0; i < t.length; i++) v[(t.charCodeAt(i) * 31 + i) % this.dimensions] += 1
      const norm = Math.hypot(...v) || 1
      return v.map((x) => x / norm)
    })
  }
}

/**
 * Select an embeddings client from the environment: Voyage if `VOYAGE_API_KEY`,
 * else OpenAI if `OPENAI_API_KEY`. Throws if neither is set (nothing runs
 * silently unembedded).
 */
export function createEmbeddingsClient(env: NodeJS.ProcessEnv = process.env): EmbeddingsClient {
  if (env.VOYAGE_API_KEY) return new VoyageEmbeddingsClient({ apiKey: env.VOYAGE_API_KEY })
  if (env.OPENAI_API_KEY) return new OpenAiEmbeddingsClient({ apiKey: env.OPENAI_API_KEY })
  throw new Error('No embeddings provider configured (set VOYAGE_API_KEY or OPENAI_API_KEY)')
}
