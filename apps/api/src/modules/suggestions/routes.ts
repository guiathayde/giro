import { dataIsoSchema, gerarSugestaoSchema } from '@giro/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ServicoSugestoes } from './service';

export type ServicoSugestoesRotas = ServicoSugestoes;

const paramsId = z.object({ id: z.coerce.number().int().positive() });
const paramsLojaData = z.object({
  id: z.coerce.number().int().positive(),
  date: dataIsoSchema,
});
const queryHoje = z.object({ date: dataIsoSchema.optional() });

/**
 * POST /stores/:id/suggestions/run   gerarSugestaoSchema → Sugestao
 * GET  /stores/:id/suggestions/:date → Sugestao
 * POST /suggestions/:id/send         → Sugestao
 * GET  /today?date=                  → PainelHoje
 */
export function rotasSugestoes(app: FastifyInstance, servico: ServicoSugestoesRotas) {
  app.post('/stores/:id/suggestions/run', async (request) => {
    const { id } = paramsId.parse(request.params);
    return servico.gerar(id, gerarSugestaoSchema.parse(request.body ?? {}));
  });

  app.get('/stores/:id/suggestions/:date', async (request) => {
    const { id, date } = paramsLojaData.parse(request.params);
    return servico.buscarPorData(id, date);
  });

  app.post('/suggestions/:id/send', async (request) => {
    const { id } = paramsId.parse(request.params);
    return servico.enviar(id);
  });

  app.get('/today', async (request) => {
    const { date } = queryHoje.parse(request.query);
    return servico.painelHoje(date);
  });
}
