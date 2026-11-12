import {
  detalheImportacaoSchema,
  importacaoSchema,
  resumoImportacaoSchema,
  type MapearImportacao,
} from '@giro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiEnviarArquivo, apiEnviarJson, apiGet, apiPostSemCorpo } from '@/lib/api';

export const ACEITAR_ARQUIVOS = '.csv,.txt,.xlsx,.xls';

export const useImportacoes = (lojaId: number | undefined) =>
  useQuery({
    queryKey: ['importacoes', { lojaId }],
    queryFn: () => apiGet(`/stores/${lojaId}/imports`, z.array(importacaoSchema)),
    enabled: lojaId !== undefined,
  });

export const useImportacao = (id: number) =>
  useQuery({
    queryKey: ['importacoes', id],
    queryFn: () => apiGet(`/imports/${id}`, detalheImportacaoSchema),
  });

function useInvalidarImportacoes() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['importacoes'] }),
      queryClient.invalidateQueries({ queryKey: ['lojas'] }),
    ]);
}

export function useEnviarArquivo(lojaId: number) {
  const invalidar = useInvalidarImportacoes();
  return useMutation({
    mutationFn: (arquivo: File) =>
      apiEnviarArquivo(`/stores/${lojaId}/imports`, 'arquivo', arquivo, resumoImportacaoSchema),
    onSuccess: invalidar,
  });
}

export function useMapear(importacaoId: number) {
  const invalidar = useInvalidarImportacoes();
  return useMutation({
    mutationFn: (corpo: MapearImportacao) =>
      apiEnviarJson('POST', `/imports/${importacaoId}/map`, corpo, resumoImportacaoSchema),
    onSuccess: invalidar,
  });
}

export function useReprocessar(importacaoId: number) {
  const invalidar = useInvalidarImportacoes();
  return useMutation({
    mutationFn: () => apiPostSemCorpo(`/imports/${importacaoId}/reprocess`, resumoImportacaoSchema),
    onSuccess: invalidar,
  });
}
