import type { FastifyBaseLogger } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

const tarefa = { stop: vi.fn(), execute: vi.fn() };
let funcao: (() => Promise<void>) | null = null;
const schedule = vi.fn((_expr: string, fn: () => Promise<void>, _opts: unknown) => {
  funcao = fn;
  return tarefa;
});

vi.mock('node-cron', async (importOriginal) => {
  const real = await importOriginal<typeof import('node-cron')>();
  return { ...real, schedule: (...args: Parameters<typeof schedule>) => schedule(...args) };
});

const { agendarRotinaDiaria } = await import('../../src/jobs/daily-suggestions');

function criarLog() {
  return { info: vi.fn(), error: vi.fn() } as unknown as FastifyBaseLogger & {
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
}

describe('agendarRotinaDiaria', () => {
  it('lança com expressão inválida e não agenda', () => {
    expect(() =>
      agendarRotinaDiaria({
        expressao: 'não é cron',
        fuso: 'America/Sao_Paulo',
        executar: () => Promise.resolve(),
        log: criarLog(),
      }),
    ).toThrow(/inválida/);
    expect(schedule).not.toHaveBeenCalled();
  });

  it('agenda com fuso, noOverlap e nome; a tarefa loga o resumo', async () => {
    const log = criarLog();
    const executar = vi.fn(() => Promise.resolve({ lojas: 1 }));
    const { parar } = agendarRotinaDiaria({
      expressao: '30 5 * * *',
      fuso: 'America/Sao_Paulo',
      executar,
      log,
    });
    expect(schedule).toHaveBeenCalledWith('30 5 * * *', expect.any(Function), {
      timezone: 'America/Sao_Paulo',
      noOverlap: true,
      name: 'sugestoes-diarias',
    });
    await funcao?.();
    expect(executar).toHaveBeenCalledTimes(1);
    expect(log.info).toHaveBeenCalled();
    parar();
    expect(tarefa.stop).toHaveBeenCalled();
  });

  it('erro na execução é logado e não propaga', async () => {
    const log = criarLog();
    agendarRotinaDiaria({
      expressao: '30 5 * * *',
      fuso: 'America/Sao_Paulo',
      executar: () => Promise.reject(new Error('banco caiu')),
      log,
    });
    await expect(funcao?.()).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalled();
  });
});
