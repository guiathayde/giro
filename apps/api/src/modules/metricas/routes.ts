import { filtroPeriodoSchema } from '@giro/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ServicoMetricas } from './service';

export type ServicoMetricasRotas = ServicoMetricas;

const paramsId = z.object({ id: z.coerce.number().int().positive() });

/**
 * GET /stores/:id/metrics?from&to → MetricasLoja
 * GET /metrics/channels           → MetricasCanais
 */
export function rotasMetricas(app: FastifyInstance, servico: ServicoMetricasRotas) {
  app.get('/stores/:id/metrics', async (request) => {
    const { id } = paramsId.parse(request.params);
    const filtro = filtroPeriodoSchema.parse(request.query);
    return servico.daLoja(id, filtro);
  });

  app.get('/metrics/channels', async () => servico.canais());
}
