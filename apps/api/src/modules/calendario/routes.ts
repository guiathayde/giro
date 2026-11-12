import type { FastifyInstance } from 'fastify';
import type { ServicoCalendario } from './service';

export type ServicoCalendarioRotas = ServicoCalendario;

/**
 * GET    /stores/:id/calendar-events?from&to → EventoCalendario[] (da loja + globais)
 * POST   /calendar-events                    novoEventoSchema → EventoCalendario
 * DELETE /calendar-events/:id
 */
export function rotasCalendario(_app: FastifyInstance, _servico: ServicoCalendarioRotas) {}
