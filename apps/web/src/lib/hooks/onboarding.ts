/**
 * React Query hooks for onboarding: the mailbox scan counters, the proposed
 * agents, and enabling the ones the user toggled on.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AgentDef, AgentProposal, OnboardingScanResult } from '@revido/db'
import { api } from '@/lib/api'
import { invalidateAgentCaches, queryKeys } from '@/lib/query-keys'

/** `GET /onboarding/scan` */
export function useOnboardingScan(options: { refetchInterval?: number | false } = {}) {
  return useQuery({
    queryKey: queryKeys.onboarding.scan(),
    queryFn: () => api.get<OnboardingScanResult>('/onboarding/scan'),
    refetchInterval: options.refetchInterval,
  })
}

/** `GET /onboarding/agent-proposals` */
export function useAgentProposals() {
  return useQuery({
    queryKey: queryKeys.onboarding.agentProposals(),
    queryFn: () => api.get<AgentProposal[]>('/onboarding/agent-proposals'),
  })
}

/** `POST /onboarding/agents` — enable the selected proposed agents. */
export function useEnableProposedAgents() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (agentIds: string[]) => api.post<AgentDef[]>('/onboarding/agents', { agentIds }),
    onSuccess: () => invalidateAgentCaches(qc),
  })
}
