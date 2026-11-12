import multipart from '@fastify/multipart';
import type { ErroApi, Health, StatusBot } from '@giro/shared';
import Fastify, { type FastifyError, type FastifyServerOptions } from 'fastify';
import { ZodError } from 'zod';
import { ErroHttp } from './erros';
import { TAMANHO_MAXIMO_ARQUIVO } from './modules/imports/limites';
import { rotasImportacoes, type ServicoImportacoesRotas } from './modules/imports/routes';
import { rotasLojas, type ServicoLojasRotas } from './modules/stores/routes';

export interface DependenciasServidor {
  logger?: FastifyServerOptions['logger'];
  verificarBanco: () => Promise<void>;
  statusBot: () => StatusBot;
  usernameBot?: () => string | undefined;
  /** rotas de domínio; ausentes nos testes que só olham o /health */
  servicos?: {
    lojas: ServicoLojasRotas;
    importacoes: ServicoImportacoesRotas;
  };
}

export function criarServidor(deps: DependenciasServidor) {
  const app = Fastify({ logger: deps.logger ?? false });

  app.register(multipart, { limits: { fileSize: TAMANHO_MAXIMO_ARQUIVO, files: 1 } });

  app.setErrorHandler((err: FastifyError, request, reply) => {
    if (err instanceof ZodError) {
      const corpo: ErroApi = { erro: 'Dados inválidos', detalhes: err.issues };
      return reply.code(400).send(corpo);
    }
    if (err instanceof ErroHttp) {
      return reply.code(err.status).send({ erro: err.message } satisfies ErroApi);
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ erro: err.message } satisfies ErroApi);
    }
    request.log.error({ err }, 'erro não tratado');
    return reply.code(500).send({ erro: 'Erro interno' } satisfies ErroApi);
  });

  // logLevel warn: o healthcheck do docker bate aqui a cada 5s
  app.get('/health', { logLevel: 'warn' }, async (request, reply) => {
    let dbOk = true;
    try {
      await deps.verificarBanco();
    } catch (err) {
      dbOk = false;
      request.log.error({ err }, 'health: banco indisponível');
    }

    const corpo: Health = {
      status: dbOk ? 'ok' : 'erro',
      db: dbOk ? 'ok' : 'erro',
      bot: deps.statusBot(),
    };
    return reply.code(dbOk ? 200 : 503).send(corpo);
  });

  if (deps.servicos) {
    const { lojas, importacoes } = deps.servicos;
    rotasLojas(app, lojas, deps.usernameBot ?? (() => undefined));
    rotasImportacoes(app, importacoes);
  }

  return app;
}
