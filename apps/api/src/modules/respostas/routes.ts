import { registrarRespostaSchema } from '@giro/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ServicoRespostas } from './service';

const paramsId = z.object({ id: z.coerce.number().int().positive() });

export type ServicoRespostasRotas = Pick<ServicoRespostas, 'registrar' | 'aceitarTudo'>;

/**
 * POST /suggestion-items/:id/response  registrarRespostaSchema → ItemSugestao
 * POST /suggestions/:id/accept-all     → Sugestao
 */
export function rotasRespostas(app: FastifyInstance, servico: ServicoRespostasRotas) {
  app.post('/suggestion-items/:id/response', async (request) => {
    const { id } = paramsId.parse(request.params);
    return servico.registrar(id, registrarRespostaSchema.parse(request.body));
  });

  app.post('/suggestions/:id/accept-all', async (request) => {
    const { id } = paramsId.parse(request.params);
    return servico.aceitarTudo(id);
  });
}
