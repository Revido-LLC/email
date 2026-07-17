/**
 * React Query hook for the user's outstanding commitments (promises made in
 * mail), surfaced on the home overview.
 */
import { useQuery } from '@tanstack/react-query'
import type { Commitment } from '@revido/db'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

/** `GET /commitments` */
export function useCommitments() {
  return useQuery({
    queryKey: queryKeys.commitments(),
    queryFn: () => api.get<Commitment[]>('/commitments'),
  })
}
