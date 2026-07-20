import { describe, expect, it, vi } from 'vitest'
import { OpenRouterLlmClient } from './openrouter'
import type { LlmCompletionRequest, LlmStreamEvent } from './types'

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body, text: async () => '' } as Response
}

/** A `fetch` mock with typed `[input, init]` call tuples (so bodies are inspectable). */
function mockFetch(handler: () => Promise<Response> = async () => jsonResponse({})) {
  return vi.fn((_input: string | URL, _init?: RequestInit): Promise<Response> => handler())
}

/** A minimal, valid completion request; individual tests override fields. */
function req(overrides: Partial<LlmCompletionRequest> = {}): LlmCompletionRequest {
  return {
    model: 'triage',
    system: 'You are the triage engine.',
    messages: [{ role: 'user', content: 'hello' }],
    maxTokens: 256,
    ...overrides,
  }
}

/** Parse the JSON body of the Nth fetch call. */
function bodyOf(fetchImpl: ReturnType<typeof mockFetch>, call = 0): Record<string, unknown> {
  return JSON.parse(fetchImpl.mock.calls[call]![1]!.body as string)
}

describe('OpenRouterLlmClient.complete request shape', () => {
  it('prepends the system message, maps fields, and sends attribution headers', async () => {
    const fetchImpl = mockFetch(async () =>
      jsonResponse({ choices: [{ message: { content: 'ok' } }] }),
    )
    const client = new OpenRouterLlmClient({ apiKey: 'or-key', fetchImpl })
    await client.complete(
      req({
        temperature: 0.2,
        stopSequences: ['STOP'],
        userId: 'user-42',
        maxTokens: 512,
      }),
    )

    const [url, init] = fetchImpl.mock.calls[0]!
    expect(String(url)).toBe('https://openrouter.ai/api/v1/chat/completions')

    const headers = init!.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer or-key')
    expect(headers['HTTP-Referer']).toBe('https://mail.revido.co')
    expect(headers['X-Title']).toBe('Revido Mail')

    const body = bodyOf(fetchImpl)
    const messages = body.messages as { role: string; content: string }[]
    expect(messages[0]).toEqual({ role: 'system', content: 'You are the triage engine.' })
    expect(messages[1]).toEqual({ role: 'user', content: 'hello' })
    expect(body.max_tokens).toBe(512)
    expect(body.temperature).toBe(0.2)
    expect(body.stop).toEqual(['STOP'])
    expect(body.user).toBe('user-42')
  })

  it('omits temperature, stop, and user when unset', async () => {
    const fetchImpl = mockFetch(async () =>
      jsonResponse({ choices: [{ message: { content: 'ok' } }] }),
    )
    const client = new OpenRouterLlmClient({ apiKey: 'k', fetchImpl })
    await client.complete(req())
    const body = bodyOf(fetchImpl)
    expect(body).not.toHaveProperty('temperature')
    expect(body).not.toHaveProperty('stop')
    expect(body).not.toHaveProperty('user')
  })
})

describe('OpenRouterLlmClient.complete response + usage mapping', () => {
  it('maps content, finish_reason, model, and the cache-aware usage split', async () => {
    const fetchImpl = mockFetch(async () =>
      jsonResponse({
        model: 'openai/gpt-5-nano',
        choices: [{ message: { content: 'the answer' }, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 20,
          prompt_tokens_details: { cached_tokens: 30 },
        },
      }),
    )
    const client = new OpenRouterLlmClient({ apiKey: 'k', fetchImpl })
    const result = await client.complete(req())

    expect(result.text).toBe('the answer')
    expect(result.stopReason).toBe('stop')
    expect(result.model).toBe('openai/gpt-5-nano')
    expect(result.usage).toEqual({
      inputTokens: 70,
      outputTokens: 20,
      cacheReadInputTokens: 30,
      cacheCreationInputTokens: 0,
    })
  })

  it('falls back to empty text, null stopReason, and the resolved slug', async () => {
    const fetchImpl = mockFetch(async () => jsonResponse({ choices: [] }))
    const client = new OpenRouterLlmClient({ apiKey: 'k', fetchImpl })
    const result = await client.complete(req())
    expect(result.text).toBe('')
    expect(result.stopReason).toBeNull()
    expect(result.model).toBe('openai/gpt-5-nano')
  })
})

describe('OpenRouterLlmClient response_format', () => {
  it('maps a JSON schema to json_schema and parses the result', async () => {
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } } }
    const fetchImpl = mockFetch(async () =>
      jsonResponse({ choices: [{ message: { content: '{"ok":true}' } }] }),
    )
    const client = new OpenRouterLlmClient({ apiKey: 'k', fetchImpl })
    const result = await client.complete(req({ responseFormat: { type: 'json', schema } }))

    expect(bodyOf(fetchImpl).response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'result', strict: true, schema },
    })
    expect(result.json).toEqual({ ok: true })
  })

  it('maps a schema-less JSON ask to json_object', async () => {
    const fetchImpl = mockFetch(async () =>
      jsonResponse({ choices: [{ message: { content: '{}' } }] }),
    )
    const client = new OpenRouterLlmClient({ apiKey: 'k', fetchImpl })
    await client.complete(req({ responseFormat: { type: 'json' } }))
    expect(bodyOf(fetchImpl).response_format).toEqual({ type: 'json_object' })
  })
})

describe('OpenRouterLlmClient reasoning', () => {
  async function reasoningFor(overrides: Partial<LlmCompletionRequest>): Promise<unknown> {
    const fetchImpl = mockFetch(async () =>
      jsonResponse({ choices: [{ message: { content: '' } }] }),
    )
    const client = new OpenRouterLlmClient({ apiKey: 'k', fetchImpl })
    await client.complete(req(overrides))
    return bodyOf(fetchImpl).reasoning
  }

  it('maps effort, enabled-with-budget, and adaptive; omits when unset', async () => {
    expect(await reasoningFor({ effort: 'high' })).toEqual({ effort: 'high' })
    expect(await reasoningFor({ thinking: { type: 'enabled', budgetTokens: 2048 } })).toEqual({
      max_tokens: 2048,
    })
    expect(await reasoningFor({ thinking: { type: 'adaptive' } })).toEqual({ enabled: true })

    const fetchImpl = mockFetch(async () =>
      jsonResponse({ choices: [{ message: { content: '' } }] }),
    )
    const client = new OpenRouterLlmClient({ apiKey: 'k', fetchImpl })
    await client.complete(req())
    expect(bodyOf(fetchImpl)).not.toHaveProperty('reasoning')
  })
})

describe('OpenRouterLlmClient provider ZDR enforcement', () => {
  it('sends the ZDR provider block by default', async () => {
    const fetchImpl = mockFetch(async () =>
      jsonResponse({ choices: [{ message: { content: '' } }] }),
    )
    const client = new OpenRouterLlmClient({ apiKey: 'k', fetchImpl })
    await client.complete(req())
    expect(bodyOf(fetchImpl).provider).toEqual({ zdr: true, data_collection: 'deny' })
  })

  it('omits the provider block when enforceZdr is false', async () => {
    const fetchImpl = mockFetch(async () =>
      jsonResponse({ choices: [{ message: { content: '' } }] }),
    )
    const client = new OpenRouterLlmClient({ apiKey: 'k', enforceZdr: false, fetchImpl })
    await client.complete(req())
    expect(bodyOf(fetchImpl)).not.toHaveProperty('provider')
  })
})

describe('OpenRouterLlmClient model map', () => {
  it('resolves a tier, honors constructor overrides, and passes raw slugs through', async () => {
    const fetchImpl = mockFetch(async () =>
      jsonResponse({ choices: [{ message: { content: '' } }] }),
    )

    const base = new OpenRouterLlmClient({ apiKey: 'k', fetchImpl })
    await base.complete(req({ model: 'triage' }))
    expect(bodyOf(fetchImpl, 0).model).toBe('openai/gpt-5-nano')

    const overridden = new OpenRouterLlmClient({
      apiKey: 'k',
      models: { triage: 'moonshotai/kimi-k3' },
      fetchImpl,
    })
    await overridden.complete(req({ model: 'triage' }))
    expect(bodyOf(fetchImpl, 1).model).toBe('moonshotai/kimi-k3')

    await base.complete(req({ model: 'x-ai/grok-4' }))
    expect(bodyOf(fetchImpl, 2).model).toBe('x-ai/grok-4')
  })
})

describe('OpenRouterLlmClient.stream', () => {
  /** Build a Response whose body streams the given SSE text pieces (one enqueue each). */
  function sseResponse(pieces: string[]): Response {
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const p of pieces) controller.enqueue(encoder.encode(p))
        controller.close()
      },
    })
    return { ok: true, status: 200, body } as unknown as Response
  }

  it('yields ordered text deltas then a done event with usage, stopReason, and model', async () => {
    const finalChunk = JSON.stringify({
      model: 'openai/gpt-5-nano',
      choices: [{ delta: {}, finish_reason: 'stop' }],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 5,
        prompt_tokens_details: { cached_tokens: 2 },
      },
    })
    // The first content event is split across two enqueues to exercise cross-chunk buffering.
    const pieces = [
      ': OPENROUTER PROCESSING\n\n',
      'data: {"choices":[{"delta":{"content":"Hel',
      'lo"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      `data: ${finalChunk}\n\n`,
      'data: [DONE]\n\n',
    ]
    const fetchImpl = mockFetch(async () => sseResponse(pieces))
    const client = new OpenRouterLlmClient({ apiKey: 'k', fetchImpl })

    const events: LlmStreamEvent[] = []
    for await (const ev of client.stream(req())) events.push(ev)

    const texts = events.filter((e) => e.type === 'text').map((e) => (e as { text: string }).text)
    expect(texts).toEqual(['Hello', ' world'])

    const done = events.at(-1)!
    expect(done.type).toBe('done')
    if (done.type === 'done') {
      expect(done.stopReason).toBe('stop')
      expect(done.model).toBe('openai/gpt-5-nano')
      expect(done.usage).toEqual({
        inputTokens: 10,
        outputTokens: 5,
        cacheReadInputTokens: 2,
        cacheCreationInputTokens: 0,
      })
    }

    // The stream body carries stream:true and usage.include so the final chunk arrives.
    const body = bodyOf(fetchImpl)
    expect(body.stream).toBe(true)
    expect(body.usage).toEqual({ include: true })
  })

  it('throws when the streaming response has no body', async () => {
    const fetchImpl = mockFetch(async () => ({ ok: true, status: 200, body: null }) as Response)
    const client = new OpenRouterLlmClient({ apiKey: 'k', fetchImpl })
    await expect(async () => {
      for await (const _ of client.stream(req())) void _
    }).rejects.toThrow(/no body/)
  })
})

describe('OpenRouterLlmClient batches', () => {
  it('throws from every batch method', async () => {
    const client = new OpenRouterLlmClient({ apiKey: 'k', fetchImpl: mockFetch() })
    await expect(client.submitBatch([])).rejects.toThrow(/not supported on OpenRouter/)
    await expect(client.pollBatch('x')).rejects.toThrow(/not supported on OpenRouter/)
    await expect(client.collectBatch('x')).rejects.toThrow(/not supported on OpenRouter/)
  })
})

describe('OpenRouterLlmClient error handling', () => {
  it('throws with the status and body on a non-ok response', async () => {
    const fetchImpl = mockFetch(
      async () => ({ ok: false, status: 429, text: async () => 'rate limited' }) as Response,
    )
    const client = new OpenRouterLlmClient({ apiKey: 'k', fetchImpl })
    await expect(client.complete(req())).rejects.toThrow(/429 rate limited/)
  })

  it('throws when constructed without an api key', () => {
    expect(() => new OpenRouterLlmClient({ apiKey: '' })).toThrow(/apiKey/)
  })
})
