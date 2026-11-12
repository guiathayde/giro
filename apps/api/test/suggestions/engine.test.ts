import { describe, expect, it } from 'vitest';
import {
  calcularSugestoes,
  estimarEstoque,
  formatarQuantidade,
} from '../../src/modules/suggestions/engine';
import { HOJE, entradaMotor, itemBase, serie } from './helpers';

function rodar(item: Parameters<typeof itemBase>[0], diasComDados: string[], hoje = HOJE) {
  const r = calcularSugestoes(entradaMotor(itemBase(item), diasComDados, { hoje }));
  return r[0]!;
}

/** estoque contado ontem, sem estimativa fraca */
const est = (quantidade: number) => ({ quantidade, fraca: false, diasDesdeContagem: 1 });

describe('série estável (regras 3, 6, 7, 9)', () => {
  // 28 dias com 10 kg/dia. base = 10 (4 ocorrências iguais), tendência = 1, H = 1.
  const s = serie(HOJE, 28, () => 10);

  it('prevê o ritmo estável e pede o que falta com 10% de margem', () => {
    // previsao = 10; cobertura = 4/10 = 0,4 < 1 → order; 10 × 1,1 − 4 = 7 → múltiplo 1 → 7
    const r = rodar({ vendas: s.vendas, estoque: est(4), custoMedio: 2 }, s.diasComDados);
    expect(r).toEqual({
      itemId: 1,
      acao: 'order',
      quantidadeSugerida: 7,
      previsao: 10,
      previsaoDiaria: 10,
      horizonteDias: 1,
      estoqueEstimado: 4,
      diasCobertura: 0.4,
      estimativaFraca: false,
      valorPedido: 14, // 7 × 2
      motivo: 'tem ~4 kg, vende ~10 kg/dia',
    });
  });
});

describe('item com feira na sexta (regras 5 e 11)', () => {
  // 20 un/dia estável; vida útil 2 → dias previstos: qui 11-12 e sex 11-13.
  const s = serie(HOJE, 28, () => 20);

  it('multiplica a previsão do dia do evento e cita o evento no motivo', () => {
    const entrada = entradaMotor(
      itemBase({ unidade: 'un', vidaUtilDias: 2, vendas: s.vendas, estoque: est(10) }),
      s.diasComDados,
      { eventos: [{ data: '2026-11-13', fatorDemanda: 1.5, descricao: 'Feira' }] },
    );
    const r = calcularSugestoes(entrada)[0]!;
    // previsao = 20 + 20 × 1,5 = 50; diária 25; 50 × 1,1 − 10 = 45 → múltiplo 5 → 45
    expect(r.previsao).toBe(50);
    expect(r.previsaoDiaria).toBe(25);
    expect(r.quantidadeSugerida).toBe(45);
    expect(r.motivo).toBe('tem ~10 un, vende ~25 un/dia, feira amanhã');
  });

  it('sem o evento a sugestão é menor', () => {
    // previsao = 40; 40 × 1,1 − 10 = 34 → múltiplo 5 → 35
    const r = rodar(
      { unidade: 'un', vidaUtilDias: 2, vendas: s.vendas, estoque: est(10) },
      s.diasComDados,
    );
    expect(r.quantidadeSugerida).toBe(35);
    expect(r.motivo).toBe('tem ~10 un, vende ~20 un/dia');
  });

  it('vários eventos no mesmo dia se multiplicam; sem descrição vira "dia de movimento"', () => {
    const entrada = entradaMotor(
      itemBase({ unidade: 'un', vidaUtilDias: 2, vendas: s.vendas, estoque: est(10) }),
      s.diasComDados,
      {
        eventos: [
          { data: '2026-11-13', fatorDemanda: 1.5 },
          { data: '2026-11-13', fatorDemanda: 2 },
        ],
      },
    );
    const r = calcularSugestoes(entrada)[0]!;
    // fator = 1,5 × 2 = 3 → previsao = 20 + 60 = 80
    expect(r.previsao).toBe(80);
    expect(r.motivo).toContain('dia de movimento');
  });

  it('evento fora do horizonte não conta', () => {
    const entrada = entradaMotor(itemBase({ vendas: s.vendas, estoque: est(10) }), s.diasComDados, {
      eventos: [{ data: '2026-11-13', fatorDemanda: 3 }],
    });
    // H = 1: só hoje entra → previsao = 20
    expect(calcularSugestoes(entrada)[0]!.previsao).toBe(20);
  });

  it('evento mais adiante no horizonte usa o nome do dia da semana', () => {
    const entrada = entradaMotor(
      itemBase({ unidade: 'un', vidaUtilDias: 3, vendas: s.vendas, estoque: est(10) }),
      s.diasComDados,
      { eventos: [{ data: '2026-11-14', fatorDemanda: 1.4, descricao: 'Feriado' }] },
    );
    expect(calcularSugestoes(entrada)[0]!.motivo).toContain('feriado sábado');
  });

  it('cita "sexta vende mais" quando a base de hoje é ≥ 1,2 × a média da semana', () => {
    // hoje = sexta 11-13; sextas vendem 40, outros dias 10 (sextas: 11-06, 10-30, 10-23, 10-16).
    // base(hoje) = 40; média das 7 bases = (40 + 6 × 10) / 7 = 14,286; 40 ≥ 17,14 → cita.
    // tendência: as duas janelas têm 1 sexta e 6 outros dias → 1. previsao = 40; 40 × 1,1 − 5 = 39
    const hoje = '2026-11-13';
    const sexta = serie(hoje, 28, (d) => (new Date(`${d}T00:00:00Z`).getUTCDay() === 5 ? 40 : 10));
    const r = rodar({ vendas: sexta.vendas, estoque: est(5) }, sexta.diasComDados, hoje);
    expect(r.quantidadeSugerida).toBe(39);
    expect(r.motivo).toBe('tem ~5 kg, vende ~40 kg/dia, sexta vende mais');
  });
});

describe('item sem histórico', () => {
  it('sem nenhum dado: previsão 0, cobertura nula e não repor por "sem venda recente"', () => {
    const r = rodar({ estoque: est(3) }, []);
    expect(r).toMatchObject({
      acao: 'skip',
      quantidadeSugerida: 0,
      previsao: 0,
      previsaoDiaria: 0,
      diasCobertura: null,
      motivo: 'sem venda recente',
    });
  });

  it('dias com dado mas nenhuma venda do item também dão skip', () => {
    const s = serie(HOJE, 28, () => 0);
    const r = rodar({ vendas: [], estoque: est(0) }, s.diasComDados);
    expect(r.acao).toBe('skip');
    expect(r.motivo).toBe('sem venda recente');
  });
});

describe('estoque desconhecido (regra 12)', () => {
  it('sem contagem o estoque é 0, a estimativa é fraca e o pedido cobre a previsão toda', () => {
    const s = serie(HOJE, 28, () => 10);
    const estoque = estimarEstoque({ hoje: HOJE, contagem: null, compras: [], vendas: [] });
    expect(estoque).toEqual({ quantidade: 0, fraca: true, diasDesdeContagem: null });
    // previsao = 10; 10 × 1,1 = 11 (e não 12, apesar de 10 × 1,1 = 11,000000000000002 em ponto flutuante)
    const r = rodar({ vendas: s.vendas, estoque }, s.diasComDados);
    expect(r.estimativaFraca).toBe(true);
    expect(r.acao).toBe('order');
    expect(r.quantidadeSugerida).toBe(11);
  });
});

describe('arredondamento por unidade (regra 9)', () => {
  // previsao = 12; pedido bruto = 12 × 1,1 − 0 = 13,2
  const s12 = serie(HOJE, 28, () => 12);
  const pedir = (parcial: Parameters<typeof itemBase>[0]) =>
    rodar({ vendas: s12.vendas, estoque: est(0), ...parcial }, s12.diasComDados);

  it('un: múltiplo de 5 → 15', () => {
    expect(pedir({ unidade: 'un' }).quantidadeSugerida).toBe(15);
  });
  it('un com múltiplo configurado de 10 → 20', () => {
    expect(pedir({ unidade: 'un', multiploPedido: 10 }).quantidadeSugerida).toBe(20);
  });
  it.each(['kg', 'maco', 'cx'] as const)('%s: múltiplo 1 → 14', (unidade) => {
    expect(pedir({ unidade }).quantidadeSugerida).toBe(14);
  });
  it('sempre para cima, mesmo com fração pequena (10,5 → 11,55 → 12)', () => {
    const s = serie(HOJE, 28, () => 10.5);
    expect(rodar({ vendas: s.vendas, estoque: est(0) }, s.diasComDados).quantidadeSugerida).toBe(
      12,
    );
  });
  it('múltiplo configurado de 0,5: 13,2 → 13,5', () => {
    expect(pedir({ multiploPedido: 0.5 }).quantidadeSugerida).toBe(13.5);
  });
  it('valorPedido = quantidade × custo médio, 2 casas; sem custo = 0', () => {
    // 14 × 1,333 = 18,662 → 18,66
    expect(pedir({ custoMedio: 1.333 }).valorPedido).toBe(18.66);
    expect(pedir({}).valorPedido).toBe(0);
  });
});

describe('encalhe detectado (regra 8)', () => {
  // 10 kg/dia, mas qua 11-11 e ter 11-10 só 4 kg. Esperado de cada um = 10 (base das 4 quartas/terças
  // anteriores ao próprio dia) → esperado = 20; vendido = 8 < 0,6 × 20 = 12.
  // Tendência = ((5 × 10 + 2 × 4) / 7) / 10 = 0,82857; base(hoje) = 10 → previsao = 8,2857.
  const s = serie(HOJE, 28, (d) => (d === '2026-11-11' || d === '2026-11-10' ? 4 : 10));

  it('estoque acima da previsão → risk, sem quantidade', () => {
    const r = rodar({ vendas: s.vendas, estoque: est(30) }, s.diasComDados);
    expect(r.acao).toBe('risk');
    expect(r.quantidadeSugerida).toBe(0);
    expect(r.previsao).toBe(8.286);
    expect(r.motivo).toBe('vendendo abaixo do ritmo, tem ~30 kg');
  });

  it('estoque abaixo da previsão → não é encalhe, é pedido', () => {
    // 5 < 8,2857 → order: 8,2857 × 1,1 − 5 = 4,114 → 5
    const r = rodar({ vendas: s.vendas, estoque: est(5) }, s.diasComDados);
    expect(r.acao).toBe('order');
    expect(r.quantidadeSugerida).toBe(5);
  });

  it('falta de dado ontem → não dá para dizer que vendeu pouco', () => {
    const semOntem = s.diasComDados.filter((d) => d !== '2026-11-11');
    const r = rodar({ vendas: s.vendas, estoque: est(30) }, semOntem);
    expect(r.acao).not.toBe('risk');
  });

  it('vendas normais nos 2 dias → sem encalhe (estoque grande vira skip)', () => {
    const normal = serie(HOJE, 28, () => 10);
    const r = rodar({ vendas: normal.vendas, estoque: est(30) }, normal.diasComDados);
    expect(r.acao).toBe('skip');
  });

  it('o evento do dia passado entra no esperado', () => {
    // fator 0,3 em ontem → esperado = 3 + 10 = 13 → limite 0,6 × 13 = 7,8; vendido 8 ≥ 7,8 → não é encalhe
    const entrada = entradaMotor(itemBase({ vendas: s.vendas, estoque: est(30) }), s.diasComDados, {
      eventos: [{ data: '2026-11-11', fatorDemanda: 0.3 }],
    });
    expect(calcularSugestoes(entrada)[0]!.acao).not.toBe('risk');
  });
});

describe('falta de dado ≠ venda zero (regra 1)', () => {
  // quinta 11-05 vendeu 10; quinta 10-29 está em diasComDados sem linha do item = vendeu 0.
  const vendas = [{ data: '2026-11-05', quantidade: 10 }];

  it('dia com dado e sem linha conta como zero', () => {
    // 2 ocorrências (10 e 0), pesos 0,4/0,3 ÷ 0,7 → 4 / 0,7 = 5,714. Tendência: janela anterior = 0 → 1.
    expect(rodar({ vendas }, ['2026-11-05', '2026-10-29']).previsao).toBe(5.714);
  });

  it('dia fora de diasComDados fica fora da média', () => {
    // só 1 ocorrência → média dos dias com dado nos 14 dias antes de hoje = 10
    expect(rodar({ vendas }, ['2026-11-05']).previsao).toBe(10);
  });
});

describe('renormalização dos pesos com 2 a 4 ocorrências (regra 3)', () => {
  // Quintas: 11-05 = 20 (mais recente), 10-29 = 10, 10-22 = 10, 10-15 = 10. As sextas compensam a
  // tendência: 11-06 = 10 e 10-30 = 20 → janela recente (20 + 10)/2 = 15 = janela anterior (10 + 20)/2 → fator 1.
  const valor: Record<string, number> = {
    '2026-11-05': 20,
    '2026-11-06': 10,
    '2026-10-29': 10,
    '2026-10-30': 20,
    '2026-10-22': 10,
    '2026-10-15': 10,
  };
  const dados = (dias: string[]) => ({
    dias,
    vendas: dias.map((data) => ({ data, quantidade: valor[data] ?? 0 })),
  });
  const duas = ['2026-11-05', '2026-11-06', '2026-10-29', '2026-10-30'];

  it('2 ocorrências: (20 × 0,4 + 10 × 0,3) ÷ 0,7 = 15,714', () => {
    const d = dados(duas);
    expect(rodar({ vendas: d.vendas }, d.dias).previsao).toBe(15.714);
  });
  it('3 ocorrências: (8 + 3 + 2) ÷ 0,9 = 14,444', () => {
    const d = dados([...duas, '2026-10-22']);
    expect(rodar({ vendas: d.vendas }, d.dias).previsao).toBe(14.444);
  });
  it('4 ocorrências: 8 + 3 + 2 + 1 = 14 (soma dos pesos = 1)', () => {
    const d = dados([...duas, '2026-10-22', '2026-10-15']);
    expect(rodar({ vendas: d.vendas }, d.dias).previsao).toBe(14);
  });
  it('só as 4 mais recentes entram (uma 5ª, mais antiga, é ignorada)', () => {
    const d = dados([...duas, '2026-10-22', '2026-10-15', '2026-10-08']);
    d.vendas.push({ data: '2026-10-08', quantidade: 1000 });
    expect(rodar({ vendas: d.vendas }, d.dias).previsao).toBe(14);
  });
});

describe('tendência limitada a [0,7; 1,3] (regra 4)', () => {
  it('alta forte: 20 vs 10 → 2 → limitada a 1,3', () => {
    // dias 11-05..11-11 = 20; demais = 10. Quintas: 20, 10, 10, 10 → base = 8 + 3 + 2 + 1 = 14. 14 × 1,3 = 18,2
    const s = serie(HOJE, 28, (d) => (d >= '2026-11-05' ? 20 : 10));
    expect(rodar({ vendas: s.vendas }, s.diasComDados).previsao).toBe(18.2);
  });
  it('queda forte: 10 vs 20 → 0,5 → limitada a 0,7', () => {
    // Quintas: 10, 20, 20, 20 → base = 4 + 6 + 4 + 2 = 16. 16 × 0,7 = 11,2
    const s = serie(HOJE, 28, (d) => (d >= '2026-11-05' ? 10 : 20));
    expect(rodar({ vendas: s.vendas }, s.diasComDados).previsao).toBe(11.2);
  });
  it('janela anterior com média 0 → fator 1', () => {
    // 11-05 = 10 e 10-29 = 0 (dia com dado, sem venda): base = 4 / 0,7 = 5,714; 10 / 0 → fator 1 (e não 1,3)
    const r = rodar({ vendas: [{ data: '2026-11-05', quantidade: 10 }] }, [
      '2026-11-05',
      '2026-10-29',
    ]);
    expect(r.previsao).toBe(5.714);
  });
  it('janela sem nenhum dado → fator 1', () => {
    // dados só na janela recente (11-05 = 10 e 11-06 = 30); 1 ocorrência de quinta →
    // média dos dias com dado nos 14 dias = (10 + 30) / 2 = 20; sem fator de 1,3
    const r = rodar(
      {
        vendas: [
          { data: '2026-11-05', quantidade: 10 },
          { data: '2026-11-06', quantidade: 30 },
        ],
      },
      ['2026-11-05', '2026-11-06'],
    );
    expect(r.previsao).toBe(20);
  });
});

describe('margem com ruptura (regra 9)', () => {
  const s = serie(HOJE, 28, () => 10);
  it('margem normal 10%: 10 × 1,1 = 11', () => {
    expect(rodar({ vendas: s.vendas, estoque: est(0) }, s.diasComDados).quantidadeSugerida).toBe(
      11,
    );
  });
  it('com ruptura nos últimos 28 dias a margem é 20%: 10 × 1,2 = 12', () => {
    const r = rodar({ vendas: s.vendas, estoque: est(0), teveRuptura: true }, s.diasComDados);
    expect(r.quantidadeSugerida).toBe(12);
  });
});

describe('cobertura ≥ horizonte vira skip (regra 8)', () => {
  // 10 kg/dia, vida útil 3 → H = 3, previsao = 30, diária = 10
  const s = serie(HOJE, 28, () => 10);
  const com = (quantidade: number) =>
    rodar({ vidaUtilDias: 3, vendas: s.vendas, estoque: est(quantidade) }, s.diasComDados);

  it('estoque 35 → cobertura 3,5 → skip "estoque p/ 3 dias"', () => {
    const r = com(35);
    expect(r.acao).toBe('skip');
    expect(r.diasCobertura).toBe(3.5);
    expect(r.quantidadeSugerida).toBe(0);
    expect(r.motivo).toBe('estoque p/ 3 dias');
  });
  it('estoque 30 → cobertura exatamente 3 → skip', () => {
    expect(com(30).acao).toBe('skip');
  });
  it('estoque 29 → cobertura 2,9 → pedido de 33 − 29 = 4', () => {
    const r = com(29);
    expect(r.acao).toBe('order');
    expect(r.quantidadeSugerida).toBe(4);
  });
});

describe('horizonte (regra 2)', () => {
  const s = serie(HOJE, 28, () => 10);
  it.each([
    [0, 1],
    [1, 1],
    [2, 2],
    [3, 3],
    [7, 3],
  ])('vida útil %i dia(s) → H = %i', (vida, h) => {
    const r = rodar({ vidaUtilDias: vida, vendas: s.vendas }, s.diasComDados);
    expect(r.horizonteDias).toBe(h);
    expect(r.previsao).toBe(10 * h);
  });
});

describe('formatação de quantidades (regra 11)', () => {
  it('kg com até 1 casa e vírgula; demais unidades inteiras', () => {
    expect(formatarQuantidade(12.34, 'kg')).toBe('12,3');
    expect(formatarQuantidade(15, 'kg')).toBe('15');
    expect(formatarQuantidade(12.96, 'kg')).toBe('13');
    expect(formatarQuantidade(7.6, 'un')).toBe('8');
    expect(formatarQuantidade(3.4, 'maco')).toBe('3');
  });
  it('o motivo usa essa formatação', () => {
    const s = serie(HOJE, 28, () => 10);
    const r = rodar({ vendas: s.vendas, estoque: est(4.25) }, s.diasComDados);
    expect(r.motivo).toBe('tem ~4,3 kg, vende ~10 kg/dia');
  });
});

describe('estimarEstoque (regra 12)', () => {
  const contagem = { quantidade: 20, data: '2026-11-08' };

  it('com contagem: base + compras (contagem < data ≤ hoje) − vendas (contagem < data < hoje)', () => {
    // compras: 11-08 (dia da contagem: não), 11-09 = 5 e 11-12 = 3 (sim), 11-13 (futuro: não)
    // vendas: 11-08 (não), 11-09 = 4 e 11-11 = 6 (sim), 11-12 (hoje: não)
    // 20 + 8 − 10 = 18
    const r = estimarEstoque({
      hoje: HOJE,
      contagem,
      compras: [
        { data: '2026-11-08', quantidade: 100 },
        { data: '2026-11-09', quantidade: 5 },
        { data: '2026-11-12', quantidade: 3 },
        { data: '2026-11-13', quantidade: 100 },
      ],
      vendas: [
        { data: '2026-11-08', quantidade: 100 },
        { data: '2026-11-09', quantidade: 4 },
        { data: '2026-11-11', quantidade: 6 },
        { data: '2026-11-12', quantidade: 50 },
      ],
    });
    expect(r).toEqual({ quantidade: 18, fraca: false, diasDesdeContagem: 4 });
  });

  it('sem contagem: base 0, todas as compras ≤ hoje e vendas < hoje; fraca', () => {
    // compras 10 + 2 (hoje) = 12; vendas 3 (11-10), a de hoje não entra → 9
    const r = estimarEstoque({
      hoje: HOJE,
      contagem: null,
      compras: [
        { data: '2026-11-01', quantidade: 10 },
        { data: '2026-11-12', quantidade: 2 },
      ],
      vendas: [
        { data: '2026-11-10', quantidade: 3 },
        { data: '2026-11-12', quantidade: 4 },
      ],
    });
    expect(r).toEqual({ quantidade: 9, fraca: true, diasDesdeContagem: null });
  });

  it('nunca negativo', () => {
    const r = estimarEstoque({
      hoje: HOJE,
      contagem: { quantidade: 5, data: '2026-11-10' },
      compras: [],
      vendas: [{ data: '2026-11-11', quantidade: 10 }],
    });
    expect(r.quantidade).toBe(0);
  });

  it('arredonda a 3 casas', () => {
    const r = estimarEstoque({
      hoje: HOJE,
      contagem: { quantidade: 1, data: '2026-11-10' },
      compras: [],
      vendas: [{ data: '2026-11-11', quantidade: 0.3333333 }],
    });
    expect(r.quantidade).toBe(0.667);
  });

  it('fraca só quando a contagem tem mais de 7 dias', () => {
    const com = (data: string) =>
      estimarEstoque({ hoje: HOJE, contagem: { quantidade: 1, data }, compras: [], vendas: [] });
    expect(com('2026-11-05')).toMatchObject({ fraca: false, diasDesdeContagem: 7 });
    expect(com('2026-11-04')).toMatchObject({ fraca: true, diasDesdeContagem: 8 });
    expect(com('2026-11-12')).toMatchObject({ fraca: false, diasDesdeContagem: 0 });
  });
});
