import {
  contagemSchema,
  faltaSchema,
  perdaSchema,
  type NovaContagem,
  type NovaFalta,
  type NovaPerda,
} from '@giro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiDelete, apiEnviarJson, apiGet } from '@/lib/api';

/** Datas AAAA-MM-DD; vazio = padrão da API (últimos 30 dias). */
export interface Periodo {
  from: string;
  to: string;
}

function consulta({ from, to }: Periodo) {
  const p = new URLSearchParams();
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const usePerdas = (lojaId: number, periodo: Periodo) =>
  useQuery({
    queryKey: ['lojas', lojaId, 'perdas', periodo],
    queryFn: () => apiGet(`/stores/${lojaId}/losses${consulta(periodo)}`, z.array(perdaSchema)),
  });

export const useFaltas = (lojaId: number, periodo: Periodo) =>
  useQuery({
    queryKey: ['lojas', lojaId, 'faltas', periodo],
    queryFn: () => apiGet(`/stores/${lojaId}/stockouts${consulta(periodo)}`, z.array(faltaSchema)),
  });

export const useContagens = (lojaId: number, periodo: Periodo) =>
  useQuery({
    queryKey: ['lojas', lojaId, 'contagens', periodo],
    queryFn: () =>
      apiGet(`/stores/${lojaId}/stock-counts${consulta(periodo)}`, z.array(contagemSchema)),
  });

/** Registros mudam as métricas também. */
function useInvalidar(lojaId: number, chave: string) {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['lojas', lojaId, chave] }),
      queryClient.invalidateQueries({ queryKey: ['lojas', lojaId, 'metricas'] }),
    ]);
  };
}

export function useRegistrarPerda(lojaId: number) {
  const invalidar = useInvalidar(lojaId, 'perdas');
  return useMutation({
    mutationFn: (nova: NovaPerda) =>
      apiEnviarJson('POST', `/stores/${lojaId}/losses`, nova, perdaSchema),
    onSuccess: invalidar,
  });
}

export function useRegistrarFalta(lojaId: number) {
  const invalidar = useInvalidar(lojaId, 'faltas');
  return useMutation({
    mutationFn: (nova: NovaFalta) =>
      apiEnviarJson('POST', `/stores/${lojaId}/stockouts`, nova, faltaSchema),
    onSuccess: invalidar,
  });
}

export function useRegistrarContagem(lojaId: number) {
  const invalidar = useInvalidar(lojaId, 'contagens');
  return useMutation({
    mutationFn: (nova: NovaContagem) =>
      apiEnviarJson('POST', `/stores/${lojaId}/stock-counts`, nova, contagemSchema),
    onSuccess: invalidar,
  });
}

export function useExcluirPerda(lojaId: number) {
  const invalidar = useInvalidar(lojaId, 'perdas');
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/losses/${id}`),
    onSuccess: invalidar,
  });
}

export function useExcluirFalta(lojaId: number) {
  const invalidar = useInvalidar(lojaId, 'faltas');
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/stockouts/${id}`),
    onSuccess: invalidar,
  });
}

export function useExcluirContagem(lojaId: number) {
  const invalidar = useInvalidar(lojaId, 'contagens');
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/stock-counts/${id}`),
    onSuccess: invalidar,
  });
}
