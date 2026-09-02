import { useMutation, useQueryClient } from '@tanstack/react-query'
import { notifications as notificationsApi } from '@/lib/api'

export function useNotificationActions() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notifications'] })
  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: invalidate,
  })
  const markAllRead = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: invalidate,
  })
  return { markRead, markAllRead }
}
