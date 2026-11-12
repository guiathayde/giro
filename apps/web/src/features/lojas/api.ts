import {
  eventoCalendarioSchema,
  linkTelegramSchema,
  lojaSchema,
  type EdicaoLoja,
  type NovaLoja,
  type NovoEvento,
} from '@giro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiDelete, apiEnviarJson, apiGet } from '@/lib/api';
import { somarDias } from './util';

export function useCriarLoja() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (loja: NovaLoja) => apiEnviarJson('POST', '/stores', loja, lojaSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lojas'] }),
  });
}

export function useEditarLoja(lojaId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: EdicaoLoja) =>
      apiEnviarJson('PATCH', `/stores/${lojaId}`, dados, lojaSchema),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lojas'] }),
        queryClient.invalidateQueries({ queryKey: ['hoje'] }),
      ]),
  });
}

export function useGerarLinkTelegram(lojaId: number) {
  return useMutation({
    mutationFn: () => apiGet(`/stores/${lojaId}/telegram-link`, linkTelegramSchema),
  });
}

export const DIAS_EVENTOS = 60;

export function useEventos(lojaId: number, hoje: string) {
  const ate = somarDias(hoje, DIAS_EVENTOS);
  return useQuery({
    queryKey: ['lojas', lojaId, 'eventos', hoje],
    queryFn: () =>
      apiGet(
        `/stores/${lojaId}/calendar-events?from=${hoje}&to=${ate}`,
        z.array(eventoCalendarioSchema),
      ),
  });
}

export function useCriarEvento(lojaId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (evento: NovoEvento) =>
      apiEnviarJson('POST', '/calendar-events', evento, eventoCalendarioSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lojas', lojaId, 'eventos'] }),
  });
}

export function useExcluirEvento(lojaId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/calendar-events/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lojas', lojaId, 'eventos'] }),
  });
}
