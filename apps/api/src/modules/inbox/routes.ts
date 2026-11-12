import { filtroInboxSchema } from '@giro/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ServicoInbox } from './service';

const paramsId = z.object({ id: z.coerce.number().int().positive() });

export type ServicoInboxRotas = Pick<ServicoInbox, 'listar' | 'resolver'>;

/**
 * GET  /inbox?status=abertas|todas → Inbox
 * POST /inbox/:id/resolve          → MensagemInbox
 */
export function rotasInbox(app: FastifyInstance, servico: ServicoInboxRotas) {
  app.get('/inbox', async (request) => {
    const { status } = filtroInboxSchema.parse(request.query);
    return servico.listar(status);
  });

  app.post('/inbox/:id/resolve', async (request) => {
    const { id } = paramsId.parse(request.params);
    return servico.resolver(id);
  });
}
