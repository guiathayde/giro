import { inboxSchema, mensagemInboxSchema } from '@giro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPostSemCorpo } from '@/lib/api';

export type StatusInbox = 'abertas' | 'todas';

export const useInbox = (status: StatusInbox) =>
  useQuery({
    queryKey: ['inbox', status],
    queryFn: () => apiGet(`/inbox?status=${status}`, inboxSchema),
  });

export function useResolverMensagem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiPostSemCorpo(`/inbox/${id}/resolve`, mensagemInboxSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbox'] }),
  });
}
