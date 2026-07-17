/**
 * React Query hooks for email signatures: the list read (compose + settings) and
 * saving a signature body.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Signature } from '@revido/db'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

/** `GET /signatures` */
export function useSignatures() {
  return useQuery({
    queryKey: queryKeys.signatures(),
    queryFn: () => api.get<Signature[]>('/signatures'),
  })
}

/** `PUT /signatures/:id` */
export function useSaveSignature() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, html }: { id: string; html: string }) =>
      api.put<Signature>(`/signatures/${id}`, { html }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.signatures() })
    },
  })
}
