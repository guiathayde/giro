import { itemSchema, lojaSchema, type MapeamentoColunas } from '@giro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiEnviarJson, apiGet } from '@/lib/api';

export const useLojas = () =>
  useQuery({ queryKey: ['lojas'], queryFn: () => apiGet('/stores', z.array(lojaSchema)) });

export const useItens = (lojaId: number | undefined) =>
  useQuery({
    queryKey: ['lojas', lojaId, 'itens'],
    queryFn: () => apiGet(`/stores/${lojaId}/items`, z.array(itemSchema)),
    enabled: lojaId !== undefined,
  });

export function useSalvarMapeamentoColunas(lojaId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mapeamento: MapeamentoColunas | null) =>
      apiEnviarJson('PUT', `/stores/${lojaId}/column-mapping`, mapeamento, lojaSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lojas'] }),
  });
}
