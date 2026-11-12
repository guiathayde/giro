import type { FastifyInstance } from 'fastify';
import type { ServicoMetricas } from './service';

export type ServicoMetricasRotas = ServicoMetricas;

/**
 * GET /stores/:id/metrics?from&to → MetricasLoja
 * GET /metrics/channels           → MetricasCanais
 */
export function rotasMetricas(_app: FastifyInstance, _servico: ServicoMetricasRotas) {}
