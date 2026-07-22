import { describe, expect, it, vi } from 'vitest'
import {
  EmbeddingsRateLimitError,
  FakeEmbeddingsClient,
  OpenAiEmbeddingsClient,
  VoyageEmbeddingsClient,
  createEmbeddingsClient,
} from './index'

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body, text: async () => '' } as Response
}

describe('VoyageEmbeddingsClient', () => {
  it('posts to Voyage with the api key and preserves input order', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      jsonResponse({
        data: [
          { embedding: [0.2], index: 1 },
          { embedding: [0.1], index: 0 },
        ],
      }),
    )
    const client = new VoyageEmbeddingsClient({ apiKey: 'vk', dimensions: 1, fetchImpl })
    const vecs = await client.embed(['a', 'b'], { inputType: 'query' })
    expect(vecs).toEqual([[0.1], [0.2]])
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(String(url)).toContain('voyageai.com')
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer vk')
    expect(JSON.parse(init!.body as string).input_type).toBe('query')
  })

  it('defaults to 1024 dims and the voyage-3 model', () => {
    const client = new VoyageEmbeddingsClient({ apiKey: 'vk' })
    expect(client.dimensions).toBe(1024)
    expect(client.model).toBe('voyage-3')
  })

  it('throws without an api key', () => {
    expect(() => new VoyageEmbeddingsClient({ apiKey: '' })).toThrow(/VOYAGE_API_KEY/)
  })
})

describe('VoyageEmbeddingsClient edge cases', () => {
  it('returns [] and makes no request for empty input', async () => {
    const fetchImpl = vi.fn()
    const client = new VoyageEmbeddingsClient({ apiKey: 'vk', fetchImpl })
    expect(await client.embed([])).toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('throws a typed EmbeddingsRateLimitError on 429 (retryable, so callers can defer)', async () => {
    const fetchImpl = vi.fn(
      async () =>
        ({ ok: false, status: 429, json: async () => ({}), text: async () => 'rate limited' }) as Response,
    )
    const client = new VoyageEmbeddingsClient({ apiKey: 'vk', fetchImpl })
    await expect(client.embed(['a'])).rejects.toBeInstanceOf(EmbeddingsRateLimitError)
    await expect(client.embed(['a'])).rejects.toMatchObject({ status: 429, provider: 'Voyage' })
  })

  it('throws a plain error (not rate-limit) on a non-retryable status', async () => {
    const fetchImpl = vi.fn(
      async () => ({ ok: false, status: 500, text: async () => 'boom' }) as Response,
    )
    const client = new VoyageEmbeddingsClient({ apiKey: 'vk', fetchImpl })
    await expect(client.embed(['a'])).rejects.toThrow(/Voyage embeddings failed: 500 boom/)
    await expect(client.embed(['a'])).rejects.not.toBeInstanceOf(EmbeddingsRateLimitError)
  })
})

describe('OpenAiEmbeddingsClient', () => {
  it('pins dimensions to 1024 in the request', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      jsonResponse({ data: [{ embedding: [1, 2, 3], index: 0 }] }),
    )
    const client = new OpenAiEmbeddingsClient({ apiKey: 'sk', fetchImpl })
    await client.embed(['hi'])
    expect(JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string).dimensions).toBe(1024)
  })

  it('preserves input order when the provider returns rows out of order', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [
          { embedding: [3], index: 2 },
          { embedding: [1], index: 0 },
          { embedding: [2], index: 1 },
        ],
      }),
    )
    const client = new OpenAiEmbeddingsClient({ apiKey: 'sk', fetchImpl })
    expect(await client.embed(['a', 'b', 'c'])).toEqual([[1], [2], [3]])
  })

  it('returns [] for empty input and throws on a non-ok status', async () => {
    const fetchImpl = vi.fn(
      async () => ({ ok: false, status: 500, text: async () => 'boom' }) as Response,
    )
    const client = new OpenAiEmbeddingsClient({ apiKey: 'sk', fetchImpl })
    expect(await client.embed([])).toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
    await expect(client.embed(['x'])).rejects.toThrow(/OpenAI embeddings failed: 500 boom/)
  })

  it('throws without an api key', () => {
    expect(() => new OpenAiEmbeddingsClient({ apiKey: '' })).toThrow(/OPENAI_API_KEY/)
  })
})

describe('FakeEmbeddingsClient', () => {
  it('is deterministic and L2-normalized', async () => {
    const client = new FakeEmbeddingsClient(8)
    const [a] = await client.embed(['hello'])
    const [b] = await client.embed(['hello'])
    expect(a).toBeDefined()
    expect(a).toEqual(b)
    expect(Math.hypot(...a!)).toBeCloseTo(1, 5)
  })

  it('defaults to 1024 dims, embeds each input, and separates distinct text', async () => {
    const client = new FakeEmbeddingsClient()
    expect(client.dimensions).toBe(1024)
    const [a, b] = await client.embed(['hello', 'goodbye'])
    expect(a).toHaveLength(1024)
    expect(a).not.toEqual(b)
  })
})

describe('createEmbeddingsClient', () => {
  it('prefers Voyage, falls back to OpenAI, else throws', () => {
    expect(createEmbeddingsClient({ VOYAGE_API_KEY: 'v' } as NodeJS.ProcessEnv)).toBeInstanceOf(
      VoyageEmbeddingsClient,
    )
    expect(createEmbeddingsClient({ OPENAI_API_KEY: 'o' } as NodeJS.ProcessEnv)).toBeInstanceOf(
      OpenAiEmbeddingsClient,
    )
    expect(() => createEmbeddingsClient({} as NodeJS.ProcessEnv)).toThrow(/No embeddings provider/)
  })
})
