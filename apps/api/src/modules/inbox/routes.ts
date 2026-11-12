import type { FastifyInstance } from 'fastify';
import type { ServicoInbox } from './service';

export type ServicoInboxRotas = ServicoInbox;

/**
 * GET  /inbox?status=abertas|todas → Inbox
 * POST /inbox/:id/resolve          → MensagemInbox
 */
export function rotasInbox(_app: FastifyInstance, _servico: ServicoInboxRotas) {}
