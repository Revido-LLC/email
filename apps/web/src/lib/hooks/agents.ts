/**
 * React Query hooks for inbox agents and their run history: the gallery reads,
 * the compile/dry-run wizard steps, create/toggle/delete, and undoing a run.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AgentDef, AgentRunEntry, Thread } from '@revido/db'
import type { AgentPlan } from '@revido/core'
import { api } from '@/lib/api'
import { invalidateAgentCaches, queryKeys } from '@/lib/query-keys'

// ---------- Reads ----------

/** `GET /agents` — the full gallery seed. */
export function useAgents() {
  return useQuery({
    queryKey: queryKeys.agents.all(),
    queryFn: () => api.get<AgentDef[]>('/agents'),
  })
}

/** `GET /agents?enabled=true` */
export function useEnabledAgents() {
  return useQuery({
    queryKey: queryKeys.agents.enabled(),
    queryFn: () => api.get<AgentDef[]>('/agents?enabled=true'),
  })
}

/** `GET /agents/:id` */
export function useAgent(id: string) {
  return useQuery({
    queryKey: queryKeys.agents.detail(id),
    queryFn: () => api.get<AgentDef>(`/agents/${id}`),
  })
}

/** `GET /agent-runs?agentId=` — all runs, or one agent's when `agentId` is given. */
export function useAgentRuns(agentId?: string) {
  return useQuery({
    queryKey: queryKeys.agentRuns.list(agentId),
    queryFn: () =>
      api.get<AgentRunEntry[]>(
        agentId ? `/agent-runs?agentId=${encodeURIComponent(agentId)}` : '/agent-runs',
      ),
  })
}

// ---------- Writes ----------

/** `POST /agents/compile` — natural-language description → compiled plan. */
export function useCompileAgent() {
  return useMutation({
    mutationFn: (input: { description: string }) => api.post<AgentPlan>('/agents/compile', input),
  })
}

/** `POST /agents/dry-run` — preview which threads a plan would match. */
export function useDryRunAgent() {
  return useMutation({
    mutationFn: (input: { plan: AgentPlan }) =>
      api.post<{ matches: Thread[] }>('/agents/dry-run', input),
  })
}

/** `POST /agents` — create & enable. */
export function useCreateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; description: string; plan: AgentPlan }) =>
      api.post<AgentDef>('/agents', input),
    onSuccess: () => invalidateAgentCaches(qc),
  })
}

/** `PATCH /agents/:id` — `{ enabled }` */
export function useToggleAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch<AgentDef>(`/agents/${id}`, { enabled }),
    onSuccess: (_agent, { id }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.agents.detail(id) })
      invalidateAgentCaches(qc)
    },
  })
}

/** `DELETE /agents/:id` */
export function useDeleteAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.del<{ deleted: true }>(`/agents/${id}`),
    onSuccess: () => invalidateAgentCaches(qc),
  })
}

/** `POST /agent-runs/:id/undo` */
export function useUndoAgentRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<AgentRunEntry>(`/agent-runs/${id}/undo`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.agentRuns.all() })
    },
  })
}
