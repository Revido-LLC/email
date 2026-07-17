/**
 * React Query hooks for the agent-approval queue: the queue read, the nav-rail
 * pending count, and approve/reject/edit/batch resolutions.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Approval } from '@revido/db'
import { api } from '@/lib/api'
import { invalidateApprovalCaches, invalidateThreadCaches, queryKeys } from '@/lib/query-keys'

// ---------- Reads ----------

/** `GET /approvals` — the queue seed. */
export function useApprovals() {
  return useQuery({
    queryKey: queryKeys.approvals.all(),
    queryFn: () => api.get<Approval[]>('/approvals'),
  })
}

/** `GET /approvals/count` — the nav-rail badge. */
export function usePendingApprovalCount() {
  return useQuery({
    queryKey: queryKeys.approvals.count(),
    queryFn: () => api.get<number>('/approvals/count'),
  })
}

// ---------- Writes ----------

/** `POST /approvals/:id/approve` */
export function useApproveApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<{ resolved: 'approved' }>(`/approvals/${id}/approve`),
    onSuccess: () => {
      invalidateApprovalCaches(qc)
      invalidateThreadCaches(qc)
    },
  })
}

/** `POST /approvals/:id/reject` */
export function useRejectApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<{ resolved: 'rejected' }>(`/approvals/${id}/reject`),
    onSuccess: () => invalidateApprovalCaches(qc),
  })
}

/** `POST /approvals/:id/approve` — with an edited preview body. */
export function useApproveEditedApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, editedPreview }: { id: string; editedPreview: string }) =>
      api.post<{ resolved: 'edited' }>(`/approvals/${id}/approve`, { editedPreview }),
    onSuccess: () => {
      invalidateApprovalCaches(qc)
      invalidateThreadCaches(qc)
    },
  })
}

/** `POST /approvals/batch-approve` — omit `agentId` to approve everything. */
export function useBatchApproveApprovals() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { agentId?: string } = {}) =>
      api.post<{ resolved: string[] }>('/approvals/batch-approve', input),
    onSuccess: () => {
      invalidateApprovalCaches(qc)
      invalidateThreadCaches(qc)
    },
  })
}
