/**
 * React Query hooks for threads and their messages.
 *
 * Reads mirror the mock getters 1:1; writes invalidate the thread lists and nav
 * counts they affect. Response types come from `@revido/db` (the API contract);
 * calls go through the `api` helper because `hc<AppType>` has no typed data
 * routes yet — see `@/lib/api`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CategoryId, Message, Thread } from '@revido/db'
import { api } from '@/lib/api'
import { invalidateThreadCaches, queryKeys } from '@/lib/query-keys'

// ---------- Reads ----------

/** `GET /threads/:id` */
export function useThread(id: string) {
  return useQuery({
    queryKey: queryKeys.threads.detail(id),
    queryFn: () => api.get<Thread>(`/threads/${id}`),
  })
}

/** `GET /threads/:id/messages` */
export function useMessages(threadId: string) {
  return useQuery({
    queryKey: queryKeys.threads.messages(threadId),
    queryFn: () => api.get<Message[]>(`/threads/${threadId}/messages`),
  })
}

/** `GET /categories/:categoryId/threads` */
export function useThreadsByCategory(categoryId: CategoryId) {
  return useQuery({
    queryKey: queryKeys.threads.byCategory(categoryId),
    queryFn: () => api.get<Thread[]>(`/categories/${categoryId}/threads`),
  })
}

/** `GET /threads/needs-you` */
export function useNeedsYou() {
  return useQuery({
    queryKey: queryKeys.threads.needsYou(),
    queryFn: () => api.get<Thread[]>('/threads/needs-you'),
  })
}

/** `GET /threads?sort=recent` */
export function useInboxByRecency() {
  return useQuery({
    queryKey: queryKeys.threads.byRecency(),
    queryFn: () => api.get<Thread[]>('/threads?sort=recent'),
  })
}

// ---------- Writes ----------

/** `POST /threads/:id/archive` */
export function useArchiveThread() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<Thread>(`/threads/${id}/archive`),
    onSuccess: () => invalidateThreadCaches(qc),
  })
}

/** `POST /threads/:id/snooze` */
export function useSnoozeThread() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, snoozedUntil }: { id: string; snoozedUntil: string }) =>
      api.post<Thread>(`/threads/${id}/snooze`, { snoozedUntil }),
    onSuccess: () => invalidateThreadCaches(qc),
  })
}

/** `POST /threads/batch/archive` */
export function useArchiveThreads() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (threadIds: string[]) =>
      api.post<{ archived: string[] }>('/threads/batch/archive', { threadIds }),
    onSuccess: () => invalidateThreadCaches(qc),
  })
}

/** `POST /threads/batch/label` */
export function useLabelThreads() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ threadIds, label }: { threadIds: string[]; label: string }) =>
      api.post<{ updated: string[] }>('/threads/batch/label', { threadIds, label }),
    onSuccess: () => invalidateThreadCaches(qc),
  })
}

/** `POST /threads/batch/mark-read` */
export function useMarkThreadsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (threadIds: string[]) =>
      api.post<{ updated: string[] }>('/threads/batch/mark-read', { threadIds }),
    onSuccess: () => invalidateThreadCaches(qc),
  })
}

/** `PATCH /threads/:id` — `{ starred }` */
export function useToggleThreadStar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean }) =>
      api.patch<Thread>(`/threads/${id}`, { starred }),
    onSuccess: () => invalidateThreadCaches(qc),
  })
}

/** `PATCH /threads/:id` — `{ unread: true }` */
export function useMarkThreadUnread() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.patch<Thread>(`/threads/${id}`, { unread: true }),
    onSuccess: () => invalidateThreadCaches(qc),
  })
}

/** `PATCH /threads/:id` — `{ labels }` (Move to…) */
export function useMoveThread() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, labels }: { id: string; labels: string[] }) =>
      api.patch<Thread>(`/threads/${id}`, { labels }),
    onSuccess: () => invalidateThreadCaches(qc),
  })
}

/** `PATCH /threads/:id` — `{ muted }` */
export function useMuteThread() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, muted }: { id: string; muted: boolean }) =>
      api.patch<Thread>(`/threads/${id}`, { muted }),
    onSuccess: () => invalidateThreadCaches(qc),
  })
}

/** `DELETE /threads/:id` */
export function useDeleteThread() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del<{ deleted: true }>(`/threads/${id}`),
    onSuccess: () => invalidateThreadCaches(qc),
  })
}

/** `PATCH /threads/:id/extracted/:index` — toggle an extracted action item done. */
export function useToggleExtractedFact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, index, done }: { id: string; index: number; done: boolean }) =>
      api.patch<Thread>(`/threads/${id}/extracted/${index}`, { done }),
    onSuccess: (_thread, { id }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.threads.detail(id) })
    },
  })
}
