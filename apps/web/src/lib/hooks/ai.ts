/**
 * React Query / streaming hooks for the on-demand AI surface: drafting, tone
 * rewrites, quick replies, and the assistant chat.
 *
 * `/ai/draft`, `/ai/rewrite` and `/ai/chat` are Server-Sent-Event streams
 * (`token` … `done`; chat inserts a `citations` event before `done`). They are
 * consumed with `apiStream` (fetch + a `ReadableStream` reader — POST bodies rule
 * out `EventSource`), surfacing the incremental text through the hook so the
 * composer / chat can render it as it arrives. `/ai/quick-replies` is a plain JSON
 * response, so it stays a `useMutation`. Triage and summarization run inside the
 * worker as mail arrives and are not callable endpoints.
 */
import * as React from 'react'
import { useMutation } from '@tanstack/react-query'
import type { ToneKey } from '@/components/composer/draft-data'
import { api, apiStream } from '@/lib/api'

/** A source thread a chat answer was grounded in. */
export interface Citation {
  threadId: string
  label: string
  /** ISO date of the cited message, when known. */
  date?: string
  /** Short body preview for the citation. */
  snippet?: string
}

/** A prior conversation turn sent for multi-turn follow-ups. */
export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

interface TextStreamState {
  /** The text accumulated so far across `token` events. */
  text: string
  isStreaming: boolean
  error: string | null
}

export interface TextStream<TBody> extends TextStreamState {
  /** Kick off a stream; resets state, then appends each `token` to `text`. */
  start: (body: TBody) => Promise<void>
  /** Abort any in-flight stream and clear the accumulated text. */
  reset: () => void
}

/** Shared engine for the `token` … `done` text streams (`/ai/draft`, `/ai/rewrite`). */
function useTextStream<TBody>(path: string): TextStream<TBody> {
  const [state, setState] = React.useState<TextStreamState>({
    text: '',
    isStreaming: false,
    error: null,
  })
  const abortRef = React.useRef<AbortController | null>(null)

  React.useEffect(() => () => abortRef.current?.abort(), [])

  const reset = React.useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setState({ text: '', isStreaming: false, error: null })
  }, [])

  const start = React.useCallback(
    async (body: TBody) => {
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      setState({ text: '', isStreaming: false, error: null })
      setState((s) => ({ ...s, isStreaming: true }))
      try {
        await apiStream(path, body, {
          signal: ac.signal,
          onEvent: (event, data) => {
            if (event === 'token') {
              const t = (data as { text?: string } | undefined)?.text ?? ''
              if (t) setState((s) => ({ ...s, text: s.text + t }))
            } else if (event === 'error') {
              setState((s) => ({ ...s, isStreaming: false, error: 'ai_stream_failed' }))
            } else if (event === 'done') {
              setState((s) => ({ ...s, isStreaming: false }))
            }
          },
        })
        if (!ac.signal.aborted) setState((s) => ({ ...s, isStreaming: false }))
      } catch (err) {
        if (ac.signal.aborted) return
        setState((s) => ({
          ...s,
          isStreaming: false,
          error: err instanceof Error ? err.message : 'ai_stream_failed',
        }))
      }
    },
    [path],
  )

  return { ...state, start, reset }
}

/** `POST /ai/draft` — stream a reply draft (in the user's voice when available). */
export function useAiDraft(): TextStream<{ threadId?: string; prompt: string }> {
  return useTextStream('/ai/draft')
}

/** `POST /ai/rewrite` — stream a tone/instruction rewrite of a supplied draft. */
export function useAiRewrite(): TextStream<{ threadId?: string; draft: string; tone: ToneKey }> {
  return useTextStream('/ai/rewrite')
}

/** `POST /ai/quick-replies` — non-streaming reply suggestions for a thread. */
export function useAiQuickReplies() {
  return useMutation({
    mutationFn: (input: { threadId: string }) =>
      api.post<{ replies: string[] }>('/ai/quick-replies', input),
  })
}

export interface ChatStream extends TextStreamState {
  citations: Citation[]
  start: (input: { threadId?: string; message: string; history?: ChatTurn[] }) => Promise<void>
  reset: () => void
}

/**
 * `POST /ai/chat` — grounded RAG answer streamed as `token` events, then a
 * `citations` event listing the source threads, then `done`.
 */
export function useAiChat(): ChatStream {
  const [state, setState] = React.useState<TextStreamState & { citations: Citation[] }>({
    text: '',
    isStreaming: false,
    error: null,
    citations: [],
  })
  const abortRef = React.useRef<AbortController | null>(null)

  React.useEffect(() => () => abortRef.current?.abort(), [])

  const reset = React.useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setState({ text: '', isStreaming: false, error: null, citations: [] })
  }, [])

  const start = React.useCallback(
    async (input: { threadId?: string; message: string; history?: ChatTurn[] }) => {
      abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setState({ text: '', isStreaming: true, error: null, citations: [] })
    try {
      await apiStream('/ai/chat', input, {
        signal: ac.signal,
        onEvent: (event, data) => {
          if (event === 'token') {
            const t = (data as { text?: string } | undefined)?.text ?? ''
            if (t) setState((s) => ({ ...s, text: s.text + t }))
          } else if (event === 'citations') {
            const citations = Array.isArray(data) ? (data as Citation[]) : []
            setState((s) => ({ ...s, citations }))
          } else if (event === 'error') {
            setState((s) => ({ ...s, isStreaming: false, error: 'ai_stream_failed' }))
          } else if (event === 'done') {
            setState((s) => ({ ...s, isStreaming: false }))
          }
        },
      })
      if (!ac.signal.aborted) setState((s) => ({ ...s, isStreaming: false }))
    } catch (err) {
      if (ac.signal.aborted) return
      setState((s) => ({
        ...s,
        isStreaming: false,
        error: err instanceof Error ? err.message : 'ai_stream_failed',
      }))
    }
    },
    [],
  )

  return { ...state, start, reset }
}
