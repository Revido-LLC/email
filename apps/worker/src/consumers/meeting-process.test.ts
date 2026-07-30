import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTranscriber } from './meeting-process'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createTranscriber', () => {
  it('uses the configured OpenRouter key with ZDR when no dedicated endpoint exists', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: 'A completed transcript.' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const transcribe = createTranscriber({
      OPENROUTER_API_KEY: 'test-key',
    } as NodeJS.ProcessEnv)
    const result = await transcribe(Uint8Array.from([1, 2, 3]))

    expect(result.segments[0]?.text).toBe('A completed transcript.')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://openrouter.ai/api/v1/audio/transcriptions')
    const body = JSON.parse(String(init.body)) as {
      model: string
      input_audio: { data: string; format: string }
      provider: { zdr: boolean; data_collection: string }
    }
    expect(body.model).toBe('openai/whisper-large-v3')
    expect(body.input_audio).toEqual({ data: 'AQID', format: 'webm' })
    expect(body.provider).toEqual({ zdr: true, data_collection: 'deny' })
  })

  it('rejects an empty transcription response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ text: '' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
    await expect(
      createTranscriber({ OPENROUTER_API_KEY: 'test-key' } as NodeJS.ProcessEnv)(
        Uint8Array.from([1]),
      ),
    ).rejects.toThrow('no text')
  })
})
