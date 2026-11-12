import {
  filtroPeriodoSchema,
  novaContagemSchema,
  novaFaltaSchema,
  novaPerdaSchema,
} from '@giro/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ServicoRegistros } from './service';

const paramsId = z.object({ id: z.coerce.number().int().positive() });

export type ServicoRegistrosRotas = ServicoRegistros;

/**
 * POST/GET /stores/:id/losses        (GET ?from&to)  DELETE /losses/:id
 * POST/GET /stores/:id/stockouts                     DELETE /stockouts/:id
 * POST/GET /stores/:id/stock-counts                  DELETE /stock-counts/:id
 */
export function rotasRegistros(app: FastifyInstance, servico: ServicoRegistrosRotas) {
  app.post('/stores/:id/losses', async (request, reply) => {
    const { id } = paramsId.parse(request.params);
    const perda = await servico.registrarPerda(id, novaPerdaSchema.parse(request.body));
    return reply.code(201).send(perda);
  });
  app.get('/stores/:id/losses', async (request) => {
    const { id } = paramsId.parse(request.params);
    return servico.listarPerdas(id, filtroPeriodoSchema.parse(request.query));
  });
  app.delete('/losses/:id', async (request, reply) => {
    const { id } = paramsId.parse(request.params);
    await servico.removerPerda(id);
    return reply.code(204).send();
  });

  app.post('/stores/:id/stockouts', async (request, reply) => {
    const { id } = paramsId.parse(request.params);
    const falta = await servico.registrarFalta(id, novaFaltaSchema.parse(request.body));
    return reply.code(201).send(falta);
  });
  app.get('/stores/:id/stockouts', async (request) => {
    const { id } = paramsId.parse(request.params);
    return servico.listarFaltas(id, filtroPeriodoSchema.parse(request.query));
  });
  app.delete('/stockouts/:id', async (request, reply) => {
    const { id } = paramsId.parse(request.params);
    await servico.removerFalta(id);
    return reply.code(204).send();
  });

  app.post('/stores/:id/stock-counts', async (request, reply) => {
    const { id } = paramsId.parse(request.params);
    const contagem = await servico.registrarContagem(id, novaContagemSchema.parse(request.body));
    return reply.code(201).send(contagem);
  });
  app.get('/stores/:id/stock-counts', async (request) => {
    const { id } = paramsId.parse(request.params);
    return servico.listarContagens(id, filtroPeriodoSchema.parse(request.query));
  });
  app.delete('/stock-counts/:id', async (request, reply) => {
    const { id } = paramsId.parse(request.params);
    await servico.removerContagem(id);
    return reply.code(204).send();
  });
}
