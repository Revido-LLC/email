/**
 * React Query hooks for the current user and the Today brief. `useMe` returns the
 * signed-in user as a `Contact` (used for sender-exclusion, prefill, and usage);
 * `useToday` backs the home overview and the assistant's day insights.
 */
import { useQuery } from '@tanstack/react-query'
import type { Contact, TodayBrief } from '@revido/db'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

/** `GET /me` */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me(),
    queryFn: () => api.get<Contact>('/me'),
  })
}

/** `GET /today` */
export function useToday() {
  return useQuery({
    queryKey: queryKeys.today(),
    queryFn: () => api.get<TodayBrief>('/today'),
  })
}
