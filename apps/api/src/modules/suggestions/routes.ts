import type { FastifyInstance } from 'fastify';
import type { ServicoSugestoes } from './service';

export type ServicoSugestoesRotas = ServicoSugestoes;

/**
 * POST /stores/:id/suggestions/run   gerarSugestaoSchema → Sugestao
 * GET  /stores/:id/suggestions/:date → Sugestao
 * POST /suggestions/:id/send         → Sugestao
 * GET  /today?date=                  → PainelHoje
 */
export function rotasSugestoes(_app: FastifyInstance, _servico: ServicoSugestoesRotas) {}
