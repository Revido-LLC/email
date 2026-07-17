/**
 * React Query hook for the "Talk to us" lead form on the marketing surface.
 */
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'

/** `POST /leads` */
export function useSubmitLead() {
  return useMutation({
    mutationFn: (input: { name: string; email: string; company: string; automate: string }) =>
      api.post<{ id: string }>('/leads', input),
  })
}
