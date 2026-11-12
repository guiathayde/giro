import {
  itemSugestaoSchema,
  painelHojeSchema,
  sugestaoSchema,
  type GerarSugestao,
  type RegistrarResposta,
} from '@giro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiEnviarJson, apiGet, apiPostSemCorpo } from '@/lib/api';

export const usePainelHoje = (data: string) =>
  useQuery({
    queryKey: ['hoje', data],
    queryFn: () => apiGet(`/today?date=${data}`, painelHojeSchema),
    // respostas chegam pelo bot a qualquer hora
    refetchInterval: 60_000,
  });

function useRecarregarHoje() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['hoje'] });
}

export function useGerarSugestao(lojaId: number, data: string) {
  const recarregar = useRecarregarHoje();
  return useMutation({
    mutationFn: (refazer: boolean) => {
      const corpo: GerarSugestao = { data, refazer };
      return apiEnviarJson('POST', `/stores/${lojaId}/suggestions/run`, corpo, sugestaoSchema);
    },
    onSuccess: recarregar,
  });
}

export function useEnviarSugestao(sugestaoId: number) {
  const recarregar = useRecarregarHoje();
  return useMutation({
    mutationFn: () => apiPostSemCorpo(`/suggestions/${sugestaoId}/send`, sugestaoSchema),
    onSuccess: recarregar,
  });
}

export function useAceitarTudo(sugestaoId: number) {
  const recarregar = useRecarregarHoje();
  return useMutation({
    mutationFn: () => apiPostSemCorpo(`/suggestions/${sugestaoId}/accept-all`, sugestaoSchema),
    onSuccess: recarregar,
  });
}

export function useRegistrarResposta(itemId: number) {
  const recarregar = useRecarregarHoje();
  return useMutation({
    mutationFn: (resposta: RegistrarResposta) =>
      apiEnviarJson('POST', `/suggestion-items/${itemId}/response`, resposta, itemSugestaoSchema),
    onSuccess: recarregar,
  });
}
