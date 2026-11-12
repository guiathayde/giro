import { metricasCanaisSchema, metricasLojaSchema } from '@giro/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';

/** from/to vazios = padrão da API. */
export const useMetricasLoja = (lojaId: number, from: string, to: string) =>
  useQuery({
    queryKey: ['lojas', lojaId, 'metricas', { from, to }],
    queryFn: () => {
      const p = new URLSearchParams();
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      const s = p.toString();
      return apiGet(`/stores/${lojaId}/metrics${s ? `?${s}` : ''}`, metricasLojaSchema);
    },
  });

export const useMetricasCanais = () =>
  useQuery({
    queryKey: ['metricas', 'canais'],
    queryFn: () => apiGet('/metrics/channels', metricasCanaisSchema),
  });
