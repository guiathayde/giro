import { timingSafeEqual } from 'node:crypto';
import multipart from '@fastify/multipart';
import type { ErroApi, Health, StatusBot } from '@giro/shared';
import Fastify, { type FastifyError, type FastifyServerOptions } from 'fastify';
import { ZodError } from 'zod';
import { ErroHttp } from './erros';
import { rotasCalendario, type ServicoCalendarioRotas } from './modules/calendario/routes';
import { TAMANHO_MAXIMO_ARQUIVO } from './modules/imports/limites';
import { rotasImportacoes, type ServicoImportacoesRotas } from './modules/imports/routes';
import { rotasInbox, type ServicoInboxRotas } from './modules/inbox/routes';
import { rotasMetricas, type ServicoMetricasRotas } from './modules/metricas/routes';
import { rotasRegistros, type ServicoRegistrosRotas } from './modules/registros/routes';
import { rotasRespostas, type ServicoRespostasRotas } from './modules/respostas/routes';
import { rotasLojas, type ServicoLojasRotas } from './modules/stores/routes';
import { rotasSugestoes, type ServicoSugestoesRotas } from './modules/suggestions/routes';

/** serviços de domínio; cada um é opcional para os testes montarem só o que usam */
export interface ServicosServidor {
  lojas: ServicoLojasRotas;
  importacoes: ServicoImportacoesRotas;
  sugestoes: ServicoSugestoesRotas;
  respostas: ServicoRespostasRotas;
  registros: ServicoRegistrosRotas;
  inbox: ServicoInboxRotas;
  calendario: ServicoCalendarioRotas;
  metricas: ServicoMetricasRotas;
}

export interface DependenciasServidor {
  logger?: FastifyServerOptions['logger'];
  verificarBanco: () => Promise<void>;
  statusBot: () => StatusBot;
  usernameBot?: () => string | undefined;
  /** token exigido em `Authorization: Bearer <token>` em tudo menos /health; ausente = sem autenticação */
  apiToken?: string;
  servicos?: Partial<ServicosServidor>;
}

function tokenConfere(recebido: string | undefined, esperado: string): boolean {
  if (!recebido?.startsWith('Bearer ')) return false;
  const a = Buffer.from(recebido.slice('Bearer '.length));
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function criarServidor(deps: DependenciasServidor) {
  const app = Fastify({ logger: deps.logger ?? false });

  app.register(multipart, { limits: { fileSize: TAMANHO_MAXIMO_ARQUIVO, files: 1 } });

  const { apiToken } = deps;
  if (apiToken) {
    app.addHook('onRequest', async (request, reply) => {
      if (request.url === '/health') return;
      if (!tokenConfere(request.headers.authorization, apiToken)) {
        await reply.code(401).send({ erro: 'Não autorizado' } satisfies ErroApi);
      }
    });
  }

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

  const s = deps.servicos ?? {};
  if (s.lojas) rotasLojas(app, s.lojas, deps.usernameBot ?? (() => undefined));
  if (s.importacoes) rotasImportacoes(app, s.importacoes);
  if (s.sugestoes) rotasSugestoes(app, s.sugestoes);
  if (s.respostas) rotasRespostas(app, s.respostas);
  if (s.registros) rotasRegistros(app, s.registros);
  if (s.inbox) rotasInbox(app, s.inbox);
  if (s.calendario) rotasCalendario(app, s.calendario);
  if (s.metricas) rotasMetricas(app, s.metricas);

  return app;
}
