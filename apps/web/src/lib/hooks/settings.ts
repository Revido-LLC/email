/**
 * React Query hooks for account settings: AI feature toggles, usage counters, and
 * the full-account delete. These back the Settings screen's AI and Usage tabs.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

/** The four AI feature switches on the Settings → AI tab. */
export interface AiPreferences {
  drafts: boolean
  agents: boolean
  chat: boolean
  digest: boolean
}

/** The usage counters on the Settings → Usage tab. */
export interface UsageCounters {
  aiDrafts: number
  agentRuns: number
  chatQueries: number
}

/** `GET /settings/ai` */
export function useAiPreferences() {
  return useQuery({
    queryKey: queryKeys.aiPreferences(),
    queryFn: () => api.get<AiPreferences>('/settings/ai'),
  })
}

/** `GET /usage` */
export function useUsage() {
  return useQuery({
    queryKey: queryKeys.usage(),
    queryFn: () => api.get<UsageCounters>('/usage'),
  })
}

/** `PATCH /settings/ai` — partial update; response is the full preference set. */
export function useUpdateAiPreferences() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<AiPreferences>) => api.patch<AiPreferences>('/settings/ai', patch),
    onSuccess: (prefs) => {
      qc.setQueryData(queryKeys.aiPreferences(), prefs)
    },
  })
}

/** `POST /account/delete-everything` */
export function useDeleteEverything() {
  return useMutation({
    mutationFn: () => api.post<{ deleted: true }>('/account/delete-everything'),
  })
}
