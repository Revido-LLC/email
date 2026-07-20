/**
 * React Query hooks for connected mailbox accounts: the settings/nav reads and
 * the destructive disconnect (which purges the account's data).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Account } from '@revido/db'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

/** `GET /accounts` */
export function useAccounts(options: { refetchInterval?: number | false } = {}) {
  return useQuery({
    queryKey: queryKeys.accounts.all(),
    queryFn: () => api.get<Account[]>('/accounts'),
    refetchInterval: options.refetchInterval,
  })
}

/** `GET /accounts/:id` */
export function useAccount(id: string) {
  return useQuery({
    queryKey: queryKeys.accounts.detail(id),
    queryFn: () => api.get<Account>(`/accounts/${id}`),
  })
}

/** `DELETE /accounts/:id` — disconnect + delete everything for that mailbox. */
export function useDisconnectAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del<{ purged: true }>(`/accounts/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.accounts.all() })
    },
  })
}
