import { describe, expect, it } from 'vitest';
import {
  calcularAdesao,
  calcularArquivos,
  calcularMotivosAjuste,
  calcularNotasAjuste,
  calcularPerdasPorItem,
  calcularPerdasSemanas,
  calcularRupturas,
  calcularTempoResposta,
  mediana,
  percentual,
  semanasDoPeriodo,
  type ItemDeSugestao,
  type PerdaLinha,
  type SugestaoEnviada,
} from '../../src/modules/metricas/agregacoes';

const em = (iso: string) => new Date(iso);

const sugestoes: SugestaoEnviada[] = [
  { id: 1, data: '2026-11-04', enviadoEm: em('2026-11-04T08:00:00Z') },
  { id: 2, data: '2026-11-05', enviadoEm: em('2026-11-05T08:00:00Z') },
  { id: 3, data: '2026-11-06', enviadoEm: em('2026-11-06T08:00:00Z') },
  { id: 4, data: '2026-11-07', enviadoEm: em('2026-11-07T08:00:00Z') },
];

function item(parcial: Partial<ItemDeSugestao> & { sugestaoId: number }): ItemDeSugestao {
  return {
    data: '2026-11-04',
    itemNome: 'Tomate',
    acao: 'order',
    resposta: null,
    motivo: null,
    nota: null,
    respondidoEm: null,
    ...parcial,
  };
}

const itens: ItemDeSugestao[] = [
  item({ sugestaoId: 1, resposta: 'accepted', respondidoEm: em('2026-11-04T08:30:00Z') }),
  item({
    sugestaoId: 1,
    itemNome: 'Alface',
    resposta: 'adjusted',
    motivo: 'price',
    nota: 'preço subiu',
    respondidoEm: em('2026-11-04T09:00:00Z'),
  }),
  item({
    sugestaoId: 2,
    data: '2026-11-05',
    resposta: 'adjusted',
    motivo: 'price',
    respondidoEm: em('2026-11-05T11:00:00Z'),
  }),
  // a rotina diária marca como ignorado sem preencher responded_at: não conta como resposta
  item({ sugestaoId: 3, data: '2026-11-06', resposta: 'ignored' }),
  item({ sugestaoId: 3, data: '2026-11-06', itemNome: 'Cebola' }),
  item({
    sugestaoId: 4,
    data: '2026-11-07',
    resposta: 'adjusted',
    motivo: 'holiday',
    respondidoEm: em('2026-11-07T08:10:00Z'),
  }),
  // skip/risk não entram nos itens de pedido
  item({ sugestaoId: 4, data: '2026-11-07', itemNome: 'Banana', acao: 'skip' }),
];

describe('percentual, mediana e semanas', () => {
  it('arredonda a 1 casa e devolve null sem denominador', () => {
    expect(percentual(2, 3)).toBe(66.7);
    expect(percentual(0, 0)).toBeNull();
    expect(percentual(5, 5)).toBe(100);
  });

  it('calcula mediana de quantidade par e ímpar', () => {
    expect(mediana([])).toBeNull();
    expect(mediana([180, 10, 30])).toBe(30);
    expect(mediana([10, 20, 30, 50])).toBe(25);
  });

  it('lista as segundas-feiras que tocam o período', () => {
    expect(semanasDoPeriodo({ inicio: '2026-11-04', fim: '2026-11-17' })).toEqual([
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
    ]);
  });
});

describe('calcularAdesao', () => {
  it('conta dias respondidos só por responded_at e itens só de pedido', () => {
    expect(calcularAdesao(sugestoes, itens)).toEqual({
      diasComSugestaoEnviada: 4,
      // sugestão 3 só tem "ignored" automático
      diasRespondidos: 3,
      percentualDiasRespondidos: 75,
      itens: { total: 6, aceitos: 1, ajustados: 3, ignorados: 1, semResposta: 1 },
      percentualAceitosOuAjustados: 66.7,
    });
  });

  it('devolve zeros e null sem sugestões', () => {
    expect(calcularAdesao([], [])).toEqual({
      diasComSugestaoEnviada: 0,
      diasRespondidos: 0,
      percentualDiasRespondidos: null,
      itens: { total: 0, aceitos: 0, ajustados: 0, ignorados: 0, semResposta: 0 },
      percentualAceitosOuAjustados: null,
    });
  });
});

describe('calcularTempoResposta', () => {
  it('usa o primeiro item respondido de cada sugestão', () => {
    // sug 1: 30 min (o mais cedo), sug 2: 180 min, sug 4: 10 min; sug 3 sem resposta
    expect(calcularTempoResposta(sugestoes, itens)).toEqual({
      respostas: 3,
      medianaMinutos: 30,
      percentualAte2h: 66.7,
    });
  });

  it('sem respostas devolve null', () => {
    expect(calcularTempoResposta(sugestoes, [])).toEqual({
      respostas: 0,
      medianaMinutos: null,
      percentualAte2h: null,
    });
  });
});

describe('calcularArquivos', () => {
  it('conta dias distintos por semana, só dentro do período', () => {
    const datas = [
      '2026-11-03', // fora do período
      '2026-11-04',
      '2026-11-04', // repetida (outro item)
      '2026-11-06',
      '2026-11-09',
      '2026-11-10',
      '2026-11-17',
    ];
    expect(calcularArquivos(datas, { inicio: '2026-11-04', fim: '2026-11-17' })).toEqual([
      { semana: '2026-11-02', diasComVendas: 2, diasNoPeriodo: 5 },
      { semana: '2026-11-09', diasComVendas: 2, diasNoPeriodo: 7 },
      { semana: '2026-11-16', diasComVendas: 1, diasNoPeriodo: 2 },
    ]);
  });
});

const perdas: PerdaLinha[] = [
  { itemId: 1, itemNome: 'Tomate', unidade: 'kg', data: '2026-11-03', quantidade: 4, valor: 20 },
  { itemId: 1, itemNome: 'Tomate', unidade: 'kg', data: '2026-11-05', quantidade: 2, valor: 10 },
  { itemId: 2, itemNome: 'Alface', unidade: 'un', data: '2026-11-04', quantidade: 6, valor: null },
  { itemId: 1, itemNome: 'Tomate', unidade: 'kg', data: '2026-11-10', quantidade: 3, valor: 15 },
  { itemId: 1, itemNome: 'Tomate', unidade: 'kg', data: '2026-11-11', quantidade: 7, valor: 35 },
  { itemId: 3, itemNome: 'Banana', unidade: 'kg', data: '2026-11-12', quantidade: 1, valor: 4 },
];

describe('calcularPerdasSemanas', () => {
  it('soma kg só de itens em kg, valor de todos e conta registros', () => {
    // fora do período: 2026-11-03
    expect(calcularPerdasSemanas(perdas, { inicio: '2026-11-04', fim: '2026-11-17' })).toEqual([
      { semana: '2026-11-02', kg: 2, valor: 10, registros: 2 },
      { semana: '2026-11-09', kg: 11, valor: 54, registros: 3 },
      { semana: '2026-11-16', kg: 0, valor: 0, registros: 0 },
    ]);
  });
});

describe('calcularPerdasPorItem', () => {
  it('compara a semana de baseline com a média semanal durante as sugestões', () => {
    // antes: 11-02..11-08 (termina antes de 11-09); durante: 11-09..11-22 = 14 dias = 2 semanas
    const resultado = calcularPerdasPorItem(perdas, {
      primeiraVenda: '2026-11-02',
      inicioSugestoes: '2026-11-09',
      fimPeriodo: '2026-11-22',
    });
    expect(resultado).toEqual([
      {
        itemId: 2,
        itemNome: 'Alface',
        unidade: 'un',
        antesPorSemana: { quantidade: 6, valor: 0 },
        durantePorSemana: { quantidade: 0, valor: 0 },
      },
      {
        itemId: 3,
        itemNome: 'Banana',
        unidade: 'kg',
        antesPorSemana: { quantidade: 0, valor: 0 },
        durantePorSemana: { quantidade: 0.5, valor: 2 },
      },
      {
        itemId: 1,
        itemNome: 'Tomate',
        unidade: 'kg',
        antesPorSemana: { quantidade: 6, valor: 30 },
        durantePorSemana: { quantidade: 5, valor: 25 },
      },
    ]);
  });

  it('sem sugestão enviada só existe a janela "antes"', () => {
    const resultado = calcularPerdasPorItem(perdas, {
      primeiraVenda: '2026-11-02',
      inicioSugestoes: null,
      fimPeriodo: '2026-11-22',
    });
    expect(resultado.map((r) => [r.itemNome, r.antesPorSemana, r.durantePorSemana])).toEqual([
      ['Alface', { quantidade: 6, valor: 0 }, null],
      ['Tomate', { quantidade: 6, valor: 30 }, null],
    ]);
  });

  it('descarta "antes" quando a primeira semana invade o início das sugestões', () => {
    const resultado = calcularPerdasPorItem(perdas, {
      primeiraVenda: '2026-11-05',
      inicioSugestoes: '2026-11-09',
      fimPeriodo: '2026-11-15',
    });
    // durante: 11-09..11-15 = 1 semana
    expect(resultado.map((r) => [r.itemNome, r.antesPorSemana, r.durantePorSemana])).toEqual([
      ['Banana', null, { quantidade: 1, valor: 4 }],
      ['Tomate', null, { quantidade: 10, valor: 50 }],
    ]);
  });

  it('sem vendas nem sugestões não há janela nenhuma', () => {
    expect(
      calcularPerdasPorItem(perdas, {
        primeiraVenda: null,
        inicioSugestoes: null,
        fimPeriodo: '2026-11-22',
      }),
    ).toEqual([]);
  });
});

describe('calcularRupturas', () => {
  it('conta por semana, com semanas vazias', () => {
    const r = [{ data: '2026-11-04' }, { data: '2026-11-08' }, { data: '2026-11-16' }];
    expect(calcularRupturas(r, { inicio: '2026-11-04', fim: '2026-11-17' })).toEqual([
      { semana: '2026-11-02', quantidade: 2 },
      { semana: '2026-11-09', quantidade: 0 },
      { semana: '2026-11-16', quantidade: 1 },
    ]);
  });
});

describe('motivos e notas de ajuste', () => {
  it('conta motivos só dos itens ajustados, do mais citado ao menos', () => {
    expect(calcularMotivosAjuste(itens)).toEqual([
      { motivo: 'price', quantidade: 2 },
      { motivo: 'holiday', quantidade: 1 },
    ]);
  });

  it('lista notas não vazias por data e item', () => {
    const comNotas = [
      ...itens,
      item({ sugestaoId: 9, data: '2026-11-01', itemNome: 'Cebola', nota: 'sem estoque' }),
      item({ sugestaoId: 9, nota: '   ' }),
    ];
    expect(calcularNotasAjuste(comNotas)).toEqual([
      { data: '2026-11-01', itemNome: 'Cebola', nota: 'sem estoque' },
      { data: '2026-11-04', itemNome: 'Alface', nota: 'preço subiu' },
    ]);
  });
});
