import { metricasCanaisSchema, metricasLojaSchema, type MetricasLoja } from '@giro/shared';
import { describe, expect, it, vi } from 'vitest';
import { criarServidor } from '../../src/app';
import { ErroHttp } from '../../src/erros';

const metricasFake: MetricasLoja = {
  loja: { id: 1, nome: 'Bom Preço', canal: 'telegram' },
  periodo: { inicio: '2026-11-02', fim: '2026-11-15' },
  inicioSugestoes: '2026-11-09',
  adesao: {
    diasComSugestaoEnviada: 5,
    diasRespondidos: 4,
    percentualDiasRespondidos: 80,
    itens: { total: 10, aceitos: 6, ajustados: 2, ignorados: 1, semResposta: 1 },
    percentualAceitosOuAjustados: 80,
  },
  tempoResposta: { respostas: 4, medianaMinutos: 25.5, percentualAte2h: 75 },
  arquivos: [{ semana: '2026-11-02', diasComVendas: 6, diasNoPeriodo: 7 }],
  perdas: {
    semanas: [{ semana: '2026-11-02', kg: 12.5, valor: 80, registros: 3 }],
    porItem: [
      {
        itemId: 1,
        itemNome: 'Tomate',
        unidade: 'kg',
        antesPorSemana: { quantidade: 8, valor: 40 },
        durantePorSemana: null,
      },
    ],
  },
  rupturas: [{ semana: '2026-11-02', quantidade: 1 }],
  motivosAjuste: [{ motivo: 'price', quantidade: 2 }],
  notasAjuste: [{ data: '2026-11-10', itemNome: 'Alface', nota: 'chuva' }],
};

function criarApp() {
  const metricas = {
    daLoja: vi.fn((id: number) =>
      id === 1
        ? Promise.resolve(metricasFake)
        : Promise.reject(new ErroHttp(404, 'Loja não encontrada')),
    ),
    canais: vi.fn(() =>
      Promise.resolve([
        {
          lojaId: 1,
          nome: 'Bom Preço',
          canal: 'telegram' as const,
          telegramVinculado: true,
          diasComSugestaoEnviada: 5,
          percentualDiasRespondidos: 80,
        },
      ]),
    ),
  };
  const app = criarServidor({
    verificarBanco: async () => {},
    statusBot: () => 'desativado',
    servicos: { metricas },
  });
  return { app, metricas };
}

describe('rotas de métricas', () => {
  it('GET /stores/:id/metrics devolve o DTO e repassa o período', async () => {
    const { app, metricas } = criarApp();
    const res = await app.inject('/stores/1/metrics?from=2026-11-02&to=2026-11-15');
    expect(res.statusCode).toBe(200);
    expect(metricasLojaSchema.parse(res.json())).toEqual(metricasFake);
    expect(metricas.daLoja).toHaveBeenCalledWith(1, { from: '2026-11-02', to: '2026-11-15' });
  });

  it('aceita período omitido', async () => {
    const { app, metricas } = criarApp();
    expect((await app.inject('/stores/1/metrics')).statusCode).toBe(200);
    expect(metricas.daLoja).toHaveBeenCalledWith(1, {});
  });

  it('400 para data ou id inválidos', async () => {
    const { app, metricas } = criarApp();
    expect((await app.inject('/stores/1/metrics?from=ontem')).statusCode).toBe(400);
    expect((await app.inject('/stores/abc/metrics')).statusCode).toBe(400);
    expect(metricas.daLoja).not.toHaveBeenCalled();
  });

  it('404 quando a loja não existe', async () => {
    const { app } = criarApp();
    const res = await app.inject('/stores/99/metrics');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ erro: 'Loja não encontrada' });
  });

  it('GET /metrics/channels devolve a lista por loja', async () => {
    const { app } = criarApp();
    const res = await app.inject('/metrics/channels');
    expect(res.statusCode).toBe(200);
    expect(metricasCanaisSchema.parse(res.json())).toHaveLength(1);
  });
});
