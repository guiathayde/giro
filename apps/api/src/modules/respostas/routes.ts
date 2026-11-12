import type { FastifyInstance } from 'fastify';
import type { ServicoRespostas } from './service';

export type ServicoRespostasRotas = ServicoRespostas;

/**
 * POST /suggestion-items/:id/response  registrarRespostaSchema → ItemSugestao
 * POST /suggestions/:id/accept-all     → Sugestao
 */
export function rotasRespostas(_app: FastifyInstance, _servico: ServicoRespostasRotas) {}
