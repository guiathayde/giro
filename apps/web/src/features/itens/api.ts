import { itemSchema, type EdicaoItem, type NovoItem } from '@giro/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiEnviarJson } from '@/lib/api';

export function useCriarItem(lojaId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: NovoItem) =>
      apiEnviarJson('POST', `/stores/${lojaId}/items`, item, itemSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lojas', lojaId, 'itens'] }),
  });
}

export function useEditarItem(itemId: number, lojaId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: EdicaoItem) =>
      apiEnviarJson('PATCH', `/items/${itemId}`, dados, itemSchema),
    // o painel "Hoje" mostra nomes e unidades dos itens
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lojas', lojaId, 'itens'] }),
        queryClient.invalidateQueries({ queryKey: ['hoje'] }),
      ]),
  });
}
