// Job diário (05:30, antes do CEASA): gera e envia as sugestões. Ligado por JOBS_ENABLED.
import type { FastifyBaseLogger } from 'fastify';
import { schedule, validate } from 'node-cron';

export interface OpcoesRotinaDiaria {
  /** expressão cron, ex.: '30 5 * * *' */
  expressao: string;
  fuso: string;
  executar: () => Promise<unknown>;
  log: FastifyBaseLogger;
}

export function agendarRotinaDiaria(opcoes: OpcoesRotinaDiaria): { parar: () => void } {
  const { expressao, fuso, executar, log } = opcoes;
  if (!validate(expressao)) {
    throw new Error(`Expressão cron inválida para a rotina diária: "${expressao}"`);
  }
  const tarefa = schedule(
    expressao,
    async () => {
      try {
        const resumo = await executar();
        log.info({ resumo }, 'rotina diária de sugestões concluída');
      } catch (err) {
        log.error({ err }, 'rotina diária de sugestões falhou');
      }
    },
    { timezone: fuso, noOverlap: true, name: 'sugestoes-diarias' },
  );
  return {
    parar: () => {
      void tarefa.stop();
    },
  };
}
