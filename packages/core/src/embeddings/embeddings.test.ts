import { describe, expect, it, vi } from 'vitest'
import {
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

describe('OpenAiEmbeddingsClient', () => {
  it('pins dimensions to 1024 in the request', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      jsonResponse({ data: [{ embedding: [1, 2, 3], index: 0 }] }),
    )
    const client = new OpenAiEmbeddingsClient({ apiKey: 'sk', fetchImpl })
    await client.embed(['hi'])
    expect(JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string).dimensions).toBe(1024)
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
