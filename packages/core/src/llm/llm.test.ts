import { describe, expect, it } from 'vitest'
import type { TriageResult } from '../prompts'
import {
  AnthropicLlmClient,
  buildCreateParams,
  type AnthropicBatchRequestItem,
  type AnthropicBatchResultItem,
  type AnthropicCreateParams,
  type AnthropicMessage,
  type AnthropicMessagesClient,
  type AnthropicStreamEvent,
} from './anthropic'
import { FakeLlmClient } from './fake'
import { MODELS, parseJsonFromText, resolveModel, type LlmCompletionRequest } from './types'

function req(overrides: Partial<LlmCompletionRequest> = {}): LlmCompletionRequest {
  return {
    model: 'triage',
    system: 'STABLE SYSTEM PREFIX',
    messages: [{ role: 'user', content: 'hello' }],
    maxTokens: 256,
    ...overrides,
  }
}

function textMessage(text: string, model = 'claude-haiku-4-5'): AnthropicMessage {
  return {
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    model,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_read_input_tokens: 4096,
      cache_creation_input_tokens: 0,
    },
  }
}

interface Recorder {
  client: AnthropicMessagesClient
  created: AnthropicCreateParams[]
  batchRequests: AnthropicBatchRequestItem[][]
}

function recorder(opts: {
  reply?: (params: AnthropicCreateParams) => AnthropicMessage
  batchResults?: AnthropicBatchResultItem[]
  retrieveStatuses?: string[]
}): Recorder {
  const created: AnthropicCreateParams[] = []
  const batchRequests: AnthropicBatchRequestItem[][] = []
  let retrieveCount = 0
  const client: AnthropicMessagesClient = {
    async create(params) {
      created.push(params)
      return (opts.reply ?? (() => textMessage('ok')))(params)
    },
    async createStream(params) {
      created.push(params)
      async function* gen(): AsyncIterable<never> {
        // no events for these tests
      }
      return gen()
    },
    batches: {
      async create(requests) {
        batchRequests.push(requests)
        return { id: 'batch_123' }
      },
      async retrieve() {
        const statuses = opts.retrieveStatuses ?? ['ended']
        const status = statuses[Math.min(retrieveCount, statuses.length - 1)]
        retrieveCount += 1
        return { processing_status: status ?? 'ended' }
      },
      async results() {
        async function* gen(): AsyncIterable<AnthropicBatchResultItem> {
          for (const r of opts.batchResults ?? []) yield r
        }
        return gen()
      },
    },
  }
  return { client, created, batchRequests }
}

describe('resolveModel + MODELS', () => {
  it('maps every tier to its baked-in Anthropic model id', () => {
    expect(MODELS.triage).toBe('claude-haiku-4-5')
    expect(MODELS.summary).toBe('claude-sonnet-5')
    expect(MODELS.escalation).toBe('claude-opus-4-8')
    expect(resolveModel('triage')).toBe('claude-haiku-4-5')
    expect(resolveModel('summary')).toBe('claude-sonnet-5')
    expect(resolveModel('escalation')).toBe('claude-opus-4-8')
  })

  it('passes a raw model id through unchanged', () => {
    expect(resolveModel('claude-opus-4-8')).toBe('claude-opus-4-8')
    expect(resolveModel('some-future-model')).toBe('some-future-model')
  })
})

describe('buildCreateParams', () => {
  it('sets a cache breakpoint on the stable system block by default', () => {
    const params = buildCreateParams(req())
    expect(params.system).toHaveLength(1)
    expect(params.system?.[0]).toMatchObject({
      type: 'text',
      text: 'STABLE SYSTEM PREFIX',
      cache_control: { type: 'ephemeral' },
    })
  })

  it('omits the cache breakpoint when cacheSystem is false', () => {
    const params = buildCreateParams(req({ cacheSystem: false }))
    expect(params.system?.[0]?.cache_control).toBeUndefined()
  })

  it('always sends thinking explicitly; default is disabled', () => {
    expect(buildCreateParams(req()).thinking).toEqual({ type: 'disabled' })
    expect(buildCreateParams(req({ thinking: { type: 'adaptive' } })).thinking).toEqual({
      type: 'adaptive',
    })
    expect(
      buildCreateParams(req({ thinking: { type: 'enabled', budgetTokens: 2048 } })).thinking,
    ).toEqual({ type: 'enabled', budget_tokens: 2048 })
  })

  it('maps the tier to a concrete model id', () => {
    expect(buildCreateParams(req({ model: 'summary' })).model).toBe('claude-sonnet-5')
  })

  it('forwards effort and a JSON schema via output_config', () => {
    const schema = { type: 'object', properties: {} }
    const params = buildCreateParams(
      req({ model: 'summary', effort: 'high', responseFormat: { type: 'json', schema } }),
    )
    expect(params.output_config).toEqual({
      effort: 'high',
      format: { type: 'json_schema', schema },
    })
  })
})

describe('AnthropicLlmClient.complete', () => {
  it('parses a strict-JSON triage response into TriageResult and maps cache usage', async () => {
    const triage: TriageResult = {
      category: 'to-reply',
      priorityScore: 74,
      priority: 'high',
      tldr: 'Sam needs the Q3 numbers before Friday.',
      language: 'en',
    }
    const rec = recorder({ reply: () => textMessage(JSON.stringify(triage)) })
    const llm = new AnthropicLlmClient(rec.client)

    const result = await llm.complete(req({ responseFormat: { type: 'json' } }))

    expect(result.json).toEqual(triage)
    expect(result.stopReason).toBe('end_turn')
    expect(result.model).toBe('claude-haiku-4-5')
    expect(result.usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cacheReadInputTokens: 4096,
      cacheCreationInputTokens: 0,
    })
    // The stable prefix carries the cache breakpoint that was actually sent.
    expect(rec.created[0]?.system?.[0]?.cache_control).toEqual({ type: 'ephemeral' })
  })

  it('concatenates multiple text blocks and leaves json undefined for non-JSON requests', async () => {
    const rec = recorder({
      reply: () => ({
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'tool_use' },
          { type: 'text', text: 'world' },
        ],
        stop_reason: 'end_turn',
        model: 'claude-sonnet-5',
        usage: { input_tokens: 1, output_tokens: 2 },
      }),
    })
    const llm = new AnthropicLlmClient(rec.client)
    const result = await llm.complete(req({ model: 'summary' }))
    expect(result.text).toBe('Hello world')
    expect(result.json).toBeUndefined()
  })
})

describe('AnthropicLlmClient batches', () => {
  it('keys results by custom_id (source is unordered) and maps status', async () => {
    const rec = recorder({
      retrieveStatuses: ['in_progress', 'ended'],
      batchResults: [
        // Deliberately out of submission order.
        { custom_id: 'msg-2', result: { type: 'succeeded', message: textMessage('two') } },
        { custom_id: 'msg-1', result: { type: 'succeeded', message: textMessage('one') } },
        { custom_id: 'msg-3', result: { type: 'errored', error: { message: 'boom' } } },
      ],
    })
    const llm = new AnthropicLlmClient(rec.client)

    const { batchId } = await llm.submitBatch([
      { customId: 'msg-1', request: req({ messages: [{ role: 'user', content: 'a' }] }) },
      { customId: 'msg-2', request: req({ messages: [{ role: 'user', content: 'b' }] }) },
      { customId: 'msg-3', request: req({ messages: [{ role: 'user', content: 'c' }] }) },
    ])
    expect(batchId).toBe('batch_123')
    expect(rec.batchRequests[0]?.map((r) => r.custom_id)).toEqual(['msg-1', 'msg-2', 'msg-3'])

    const results = await llm.collectBatch(batchId, { pollIntervalMs: 0 })
    expect(results.get('msg-1')?.result?.text).toBe('one')
    expect(results.get('msg-2')?.result?.text).toBe('two')
    expect(results.get('msg-3')?.status).toBe('errored')
    expect(results.get('msg-3')?.error).toContain('boom')
  })
})

describe('FakeLlmClient', () => {
  it('records calls and returns a deterministic parsed JSON payload', async () => {
    const fake = new FakeLlmClient()
    const result = await fake.complete(req({ responseFormat: { type: 'json' } }))
    expect(fake.calls).toHaveLength(1)
    expect(result.json).toMatchObject({ category: 'fyi', priority: 'normal', language: 'en' })
  })

  it('honors a custom responder and echoes streaming text then done', async () => {
    const fake = new FakeLlmClient({ respond: () => 'canned' })
    const events = []
    for await (const e of fake.stream(req())) events.push(e)
    expect(events).toEqual([
      { type: 'text', text: 'canned' },
      { type: 'done', stopReason: 'end_turn', usage: expect.anything(), model: 'claude-haiku-4-5' },
    ])
  })

  it('collects batch results keyed by customId', async () => {
    const fake = new FakeLlmClient({ respond: () => 'x' })
    const { batchId } = await fake.submitBatch([
      { customId: 'a', request: req() },
      { customId: 'b', request: req() },
    ])
    const results = await fake.collectBatch(batchId)
    expect([...results.keys()].sort()).toEqual(['a', 'b'])
    expect(results.get('a')?.status).toBe('succeeded')
  })
})

describe('parseJsonFromText', () => {
  it('extracts JSON even when wrapped in prose or a code fence', () => {
    expect(parseJsonFromText('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(parseJsonFromText('Here you go: {"b":2} — done')).toEqual({ b: 2 })
    expect(parseJsonFromText('not json at all')).toBeUndefined()
  })
})

describe('buildCreateParams — optional fields', () => {
  it('forwards stop sequences, temperature, and user metadata', () => {
    const params = buildCreateParams(
      req({ stopSequences: ['STOP'], temperature: 0.2, userId: 'user-7' }),
    )
    expect(params.stop_sequences).toEqual(['STOP'])
    expect(params.temperature).toBe(0.2)
    expect(params.metadata).toEqual({ user_id: 'user-7' })
  })

  it('omits empty optional fields (no stop_sequences / metadata / output_config)', () => {
    const params = buildCreateParams(req({ stopSequences: [] }))
    expect(params.stop_sequences).toBeUndefined()
    expect(params.metadata).toBeUndefined()
    expect(params.output_config).toBeUndefined()
  })

  it('maps adaptive thinking with a display mode to the wire shape', () => {
    expect(buildCreateParams(req({ thinking: { type: 'adaptive', display: 'omitted' } })).thinking).toEqual(
      { type: 'adaptive', display: 'omitted' },
    )
  })
})

describe('AnthropicLlmClient.stream', () => {
  it('emits text deltas then a done event carrying model, stopReason, and usage', async () => {
    const events: AnthropicStreamEvent[] = [
      {
        type: 'message_start',
        message: { model: 'claude-sonnet-5', usage: { input_tokens: 12, cache_read_input_tokens: 8 } },
      },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo' } },
      { type: 'content_block_delta', delta: { type: 'input_json_delta', text: 'IGNORED' } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
    ]
    const client: AnthropicMessagesClient = {
      create: () => Promise.reject(new Error('unused')),
      async createStream() {
        async function* gen(): AsyncIterable<AnthropicStreamEvent> {
          for (const e of events) yield e
        }
        return gen()
      },
      batches: {
        create: () => Promise.resolve({ id: 'x' }),
        retrieve: () => Promise.resolve({ processing_status: 'ended' }),
        results: () => Promise.reject(new Error('unused')),
      },
    }
    const llm = new AnthropicLlmClient(client)
    const out = []
    for await (const e of llm.stream(req({ model: 'summary' }))) out.push(e)

    expect(out).toEqual([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo' },
      {
        type: 'done',
        stopReason: 'end_turn',
        model: 'claude-sonnet-5',
        usage: {
          inputTokens: 12,
          outputTokens: 5,
          cacheReadInputTokens: 8,
          cacheCreationInputTokens: 0,
        },
      },
    ])
  })
})

describe('AnthropicLlmClient batch polling', () => {
  it('polls until the batch ends, then maps canceled/expired statuses', async () => {
    const rec = recorder({
      retrieveStatuses: ['in_progress', 'in_progress', 'ended'],
      batchResults: [
        { custom_id: 'a', result: { type: 'canceled' } },
        { custom_id: 'b', result: { type: 'expired' } },
        { custom_id: 'c', result: { type: 'weird-unknown', error: { message: 'x' } } },
      ],
    })
    const llm = new AnthropicLlmClient(rec.client, { batchPollIntervalMs: 0 })
    const results = await llm.collectBatch('batch_123')
    expect(results.get('a')?.status).toBe('canceled')
    expect(results.get('b')?.status).toBe('expired')
    // An unrecognized result type falls back to 'errored'.
    expect(results.get('c')?.status).toBe('errored')
    expect(results.get('a')?.error).toBeUndefined()
  })

  it('treats an unknown processing status as still in-progress', async () => {
    const rec = recorder({ retrieveStatuses: ['queued'] })
    const llm = new AnthropicLlmClient(rec.client)
    expect(await llm.pollBatch('batch_123')).toEqual({ status: 'in_progress' })
  })
})
