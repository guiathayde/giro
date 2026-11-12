import { mapeamentoColunasSchema } from '@giro/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ServicoLojas } from './service';

const paramsId = z.object({ id: z.coerce.number().int().positive() });

export type ServicoLojasRotas = Pick<
  ServicoLojas,
  'listar' | 'itens' | 'salvarMapeamentoColunas' | 'linkTelegram'
>;

export function rotasLojas(
  app: FastifyInstance,
  servico: ServicoLojasRotas,
  usernameBot: () => string | undefined,
) {
  app.get('/stores', async () => servico.listar());

  app.get('/stores/:id/items', async (request) => {
    const { id } = paramsId.parse(request.params);
    return servico.itens(id);
  });

  // null limpa o mapeamento e volta para a detecção automática
  app.put('/stores/:id/column-mapping', async (request) => {
    const { id } = paramsId.parse(request.params);
    const mapeamento = mapeamentoColunasSchema.nullable().parse(request.body ?? null);
    return servico.salvarMapeamentoColunas(id, mapeamento);
  });

  app.get('/stores/:id/telegram-link', async (request) => {
    const { id } = paramsId.parse(request.params);
    return servico.linkTelegram(id, usernameBot());
  });
}
