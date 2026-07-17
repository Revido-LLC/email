/**
 * React Query hooks for the on-demand AI surface: drafting, tone rewrites,
 * quick replies, and the assistant chat. Triage and summarization run inside the
 * worker as mail arrives, so they are not callable endpoints — the UI only reads
 * their output off the thread.
 */
import { useMutation } from '@tanstack/react-query'
import type { ToneKey } from '@/components/composer/draft-data'
import { api } from '@/lib/api'

/** `POST /ai/draft` */
export function useAiDraft() {
  return useMutation({
    mutationFn: (input: { threadId?: string; prompt: string }) =>
      api.post<{ scenarioId: string; paragraphs: string[] }>('/ai/draft', input),
  })
}

/** `POST /ai/rewrite` */
export function useAiRewrite() {
  return useMutation({
    mutationFn: (input: { threadId?: string; scenarioId: string; tone: ToneKey }) =>
      api.post<{ paragraphs: string[] }>('/ai/rewrite', input),
  })
}

/** `POST /ai/quick-replies` */
export function useAiQuickReplies() {
  return useMutation({
    mutationFn: (input: { threadId: string }) =>
      api.post<{ replies: string[] }>('/ai/quick-replies', input),
  })
}

/** `POST /ai/chat` */
export function useAiChat() {
  return useMutation({
    mutationFn: (input: { threadId?: string; message: string }) =>
      api.post<{ text: string; citations: { threadId: string; label: string }[] }>(
        '/ai/chat',
        input,
      ),
  })
}
