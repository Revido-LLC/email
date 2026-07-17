/**
 * React Query hooks for the composer and message actions: sending, undo-send,
 * replying, uploading attachments, and loading blocked remote images.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Attachment, Contact, Message } from '@revido/db'
import { api } from '@/lib/api'
import { invalidateThreadCaches, queryKeys } from '@/lib/query-keys'

/** `POST /messages` — send a new message / composed thread. */
export function useSendMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      threadId?: string
      to: Contact[]
      subject: string
      html: string
      attachmentIds: string[]
      remindIfNoReply?: boolean
    }) => api.post<Message>('/messages', input),
    onSuccess: () => invalidateThreadCaches(qc),
  })
}

/** `POST /messages/:id/cancel` — the 10s undo-send window. */
export function useCancelSend() {
  return useMutation({
    mutationFn: (id: string) => api.post<{ cancelled: true }>(`/messages/${id}/cancel`),
  })
}

/** `POST /threads/:id/reply` */
export function useReplyToThread() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ threadId, html }: { threadId: string; html: string }) =>
      api.post<Message>(`/threads/${threadId}/reply`, { html }),
    onSuccess: (_message, { threadId }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.threads.messages(threadId) })
      void qc.invalidateQueries({ queryKey: queryKeys.threads.detail(threadId) })
      invalidateThreadCaches(qc)
    },
  })
}

/** `POST /attachments` — multipart upload of a single file. */
export function useUploadAttachment() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return api.post<Attachment>('/attachments', form)
    },
  })
}

/** `POST /messages/:id/load-images` — fetch a body with remote images unblocked. */
export function useLoadRemoteImages() {
  return useMutation({
    mutationFn: (id: string) => api.post<{ html: string }>(`/messages/${id}/load-images`),
  })
}
