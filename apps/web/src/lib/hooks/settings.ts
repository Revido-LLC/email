/**
 * React Query hooks for account settings: AI feature toggles, usage counters, the
 * cross-device appearance (theme) preference, and the full-account delete. These
 * back the Settings screen's AI, Appearance, and Usage tabs.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ThemePreference } from '@/lib/app-state'
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

/**
 * The stored appearance preference. `theme` is `null` when the user has never set
 * one on the server — the client then keeps using its localStorage cache.
 */
export interface Appearance {
  theme: ThemePreference | null
}

/**
 * `GET /settings/appearance` — the server-stored theme. Pass `enabled` to gate the
 * fetch on auth (it 401s for anonymous visitors).
 */
export function useAppearance(enabled = true) {
  return useQuery({
    queryKey: queryKeys.appearance(),
    queryFn: () => api.get<Appearance>('/settings/appearance'),
    enabled,
  })
}

/** `PATCH /settings/appearance` — persist the theme; response echoes the value. */
export function useUpdateAppearance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (theme: ThemePreference) =>
      api.patch<Appearance>('/settings/appearance', { theme }),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.appearance(), data)
    },
  })
}

/** `POST /account/delete-everything` */
export function useDeleteEverything() {
  return useMutation({
    mutationFn: () => api.post<{ deleted: true }>('/account/delete-everything'),
  })
}
