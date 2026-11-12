import type { FastifyInstance } from 'fastify';
import type { ServicoRegistros } from './service';

export type ServicoRegistrosRotas = ServicoRegistros;

/**
 * POST/GET /stores/:id/losses        (GET ?from&to)  DELETE /losses/:id
 * POST/GET /stores/:id/stockouts                     DELETE /stockouts/:id
 * POST/GET /stores/:id/stock-counts                  DELETE /stock-counts/:id
 */
export function rotasRegistros(_app: FastifyInstance, _servico: ServicoRegistrosRotas) {}
