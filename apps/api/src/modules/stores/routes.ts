import {
  edicaoItemSchema,
  edicaoLojaSchema,
  mapeamentoColunasSchema,
  novaLojaSchema,
  novoItemSchema,
} from '@giro/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ServicoLojas } from './service';

const paramsId = z.object({ id: z.coerce.number().int().positive() });

export type ServicoLojasRotas = Pick<
  ServicoLojas,
  | 'listar'
  | 'itens'
  | 'salvarMapeamentoColunas'
  | 'linkTelegram'
  | 'criar'
  | 'editar'
  | 'criarItem'
  | 'editarItem'
>;

export function rotasLojas(
  app: FastifyInstance,
  servico: ServicoLojasRotas,
  usernameBot: () => string | undefined,
) {
  app.get('/stores', async () => servico.listar());

  app.post('/stores', async (request, reply) => {
    const dados = novaLojaSchema.parse(request.body);
    return reply.code(201).send(await servico.criar(dados));
  });

  app.patch('/stores/:id', async (request) => {
    const { id } = paramsId.parse(request.params);
    return servico.editar(id, edicaoLojaSchema.parse(request.body));
  });

  app.post('/stores/:id/items', async (request, reply) => {
    const { id } = paramsId.parse(request.params);
    const dados = novoItemSchema.parse(request.body);
    return reply.code(201).send(await servico.criarItem(id, dados));
  });

  app.patch('/items/:id', async (request) => {
    const { id } = paramsId.parse(request.params);
    return servico.editarItem(id, edicaoItemSchema.parse(request.body));
  });

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
