import { filtroPeriodoSchema, novoEventoSchema } from '@giro/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ServicoCalendario } from './service';

export type ServicoCalendarioRotas = ServicoCalendario;

const paramsId = z.object({ id: z.coerce.number().int().positive() });

/**
 * GET    /stores/:id/calendar-events?from&to → EventoCalendario[] (da loja + globais)
 * POST   /calendar-events                    novoEventoSchema → EventoCalendario
 * DELETE /calendar-events/:id
 */
export function rotasCalendario(app: FastifyInstance, servico: ServicoCalendarioRotas) {
  app.get('/stores/:id/calendar-events', async (request) => {
    const { id } = paramsId.parse(request.params);
    const filtro = filtroPeriodoSchema.parse(request.query);
    return servico.listar(id, filtro);
  });

  app.post('/calendar-events', async (request, reply) => {
    const dados = novoEventoSchema.parse(request.body);
    return reply.code(201).send(await servico.criar(dados));
  });

  app.delete('/calendar-events/:id', async (request, reply) => {
    const { id } = paramsId.parse(request.params);
    await servico.remover(id);
    return reply.code(204).send();
  });
}
