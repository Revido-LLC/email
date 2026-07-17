/**
 * React Query hooks for reminders / follow-ups: the list read plus the two
 * ChaserBlock actions (send a chaser, snooze the reminder).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Reminder } from '@revido/db'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

/** `GET /reminders` */
export function useReminders() {
  return useQuery({
    queryKey: queryKeys.reminders(),
    queryFn: () => api.get<Reminder[]>('/reminders'),
  })
}

/** `POST /reminders/:id/send-chaser` */
export function useSendChaser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<{ sent: true }>(`/reminders/${id}/send-chaser`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.reminders() })
    },
  })
}

/** `POST /reminders/:id/snooze` */
export function useSnoozeReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, until }: { id: string; until: string }) =>
      api.post<Reminder>(`/reminders/${id}/snooze`, { until }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.reminders() })
    },
  })
}
