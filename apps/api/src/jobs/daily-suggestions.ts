// Job diário (05:30, antes do CEASA): gera e envia as sugestões. Ligado por JOBS_ENABLED.
import type { FastifyBaseLogger } from 'fastify';

export interface OpcoesRotinaDiaria {
  /** expressão cron, ex.: '30 5 * * *' */
  expressao: string;
  fuso: string;
  executar: () => Promise<unknown>;
  log: FastifyBaseLogger;
}

export function agendarRotinaDiaria(_opcoes: OpcoesRotinaDiaria): { parar: () => void } {
  throw new Error('agendarRotinaDiaria: não implementado');
}
