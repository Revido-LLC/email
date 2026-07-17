/**
 * React Query hooks for category counts — the nav-rail badges and per-category
 * unread totals. Static category metadata (the 9 locked categories) ships as a
 * frontend constant, not an endpoint, so it has no hook here.
 */
import { useQuery } from '@tanstack/react-query'
import type { CategoryId } from '@revido/db'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

/** `GET /categories/counts` */
export function useCategoryCounts() {
  return useQuery({
    queryKey: queryKeys.categories.counts(),
    queryFn: () => api.get<Record<CategoryId, number>>('/categories/counts'),
  })
}

/** `GET /categories/:categoryId/unread-count` */
export function useUnreadCount(categoryId: CategoryId) {
  return useQuery({
    queryKey: queryKeys.categories.unreadCount(categoryId),
    queryFn: () => api.get<number>(`/categories/${categoryId}/unread-count`),
  })
}
