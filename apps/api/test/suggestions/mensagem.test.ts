import { describe, expect, it } from 'vitest';
import {
  gerarMensagem,
  ordenarParaMensagem,
  type ItemParaMensagem,
} from '../../src/modules/suggestions/mensagem';

let proximoId = 1;
function item(parcial: Partial<ItemParaMensagem> & { nome: string }): ItemParaMensagem {
  return {
    itemId: proximoId++,
    unidade: 'kg',
    acao: 'order',
    quantidadeSugerida: 10,
    previsao: 10,
    previsaoDiaria: 10,
    horizonteDias: 1,
    estoqueEstimado: 0,
    diasCobertura: 0,
    estimativaFraca: false,
    valorPedido: 0,
    motivo: 'tem ~0 kg, vende ~10 kg/dia',
    ...parcial,
  };
}

const mamao = item({
  nome: 'Mamão',
  acao: 'risk',
  quantidadeSugerida: 0,
  estoqueEstimado: 22,
  motivo: 'vendendo abaixo do ritmo, tem ~22 kg',
});
const tomate = item({
  nome: 'Tomate',
  quantidadeSugerida: 40,
  valorPedido: 120,
  motivo: 'tem ~15 kg, vende ~25 kg/dia',
});
const cebola = item({
  nome: 'Cebola',
  quantidadeSugerida: 20,
  valorPedido: 60,
  motivo: 'tem ~8 kg, vende ~10 kg/dia',
});
const alface = item({
  nome: 'Alface',
  unidade: 'un',
  quantidadeSugerida: 60,
  valorPedido: 30,
  motivo: 'feira amanhã',
});
const banana = item({
  nome: 'Banana',
  acao: 'skip',
  quantidadeSugerida: 0,
  motivo: 'estoque p/ 3 dias',
});
const batata = item({
  nome: 'Batata',
  acao: 'skip',
  quantidadeSugerida: 0,
  motivo: 'sem venda recente',
});
const limao = item({
  nome: 'Limão',
  acao: 'skip',
  quantidadeSugerida: 0,
  motivo: 'sem venda recente',
});

const TODOS = [limao, alface, tomate, batata, mamao, cebola, banana];

describe('ordenarParaMensagem', () => {
  it('encalhes, depois pedidos por valor decrescente com posições 1..N, depois não repor por nome', () => {
    const r = ordenarParaMensagem(TODOS);
    expect(r.map((i) => [i.nome, i.posicao])).toEqual([
      ['Mamão', null],
      ['Tomate', 1], // 120
      ['Cebola', 2], // 60
      ['Alface', 3], // 30
      ['Banana', null],
      ['Batata', null],
      ['Limão', null],
    ]);
  });

  it('empate de valor desempata por nome', () => {
    const a = item({ nome: 'Pepino', valorPedido: 50 });
    const b = item({ nome: 'Abobrinha', valorPedido: 50 });
    const c = item({ nome: 'Beterraba', valorPedido: 80 });
    expect(ordenarParaMensagem([a, b, c]).map((i) => [i.nome, i.posicao])).toEqual([
      ['Beterraba', 1],
      ['Abobrinha', 2],
      ['Pepino', 3],
    ]);
  });

  it('não altera a lista de entrada', () => {
    const entrada = [...TODOS];
    ordenarParaMensagem(entrada);
    expect(entrada).toEqual(TODOS);
  });
});

describe('formato exato da mensagem, canal telegram', () => {
  it('encalhe, pedidos e não repor', () => {
    const texto = gerarMensagem({
      nomeDono: 'Seu Antônio',
      data: '2026-11-12',
      canal: 'telegram',
      itens: ordenarParaMensagem(TODOS),
    });
    expect(texto).toBe(
      [
        'Bom dia, Seu Antônio! Sugestão de hoje (qui 12/11):',
        '',
        '⚠️ Mamão: vendendo abaixo do ritmo, tem ~22 kg. Vale promoção hoje.',
        '',
        'PEDIR',
        '1. Tomate — 40 kg (tem ~15, vende ~25/dia)',
        '2. Cebola — 20 kg (tem ~8, vende ~10/dia)',
        '3. Alface — 60 un (feira amanhã)',
        '',
        'NÃO REPOR HOJE',
        'Banana (estoque p/ 3 dias), Batata, Limão',
      ].join('\n'),
    );
  });
});

describe('formato exato da mensagem, canal manual', () => {
  it('acrescenta a linha de resposta no fim', () => {
    const texto = gerarMensagem({
      nomeDono: 'Seu Antônio',
      data: '2026-11-12',
      canal: 'manual',
      itens: ordenarParaMensagem(TODOS),
    });
    expect(texto).toBe(
      [
        'Bom dia, Seu Antônio! Sugestão de hoje (qui 12/11):',
        '',
        '⚠️ Mamão: vendendo abaixo do ritmo, tem ~22 kg. Vale promoção hoje.',
        '',
        'PEDIR',
        '1. Tomate — 40 kg (tem ~15, vende ~25/dia)',
        '2. Cebola — 20 kg (tem ~8, vende ~10/dia)',
        '3. Alface — 60 un (feira amanhã)',
        '',
        'NÃO REPOR HOJE',
        'Banana (estoque p/ 3 dias), Batata, Limão',
        '',
        'Responda *ok* para aceitar, ou o número e a quantidade para ajustar (ex.: 1 35).',
      ].join('\n'),
    );
  });
});

describe('seções vazias', () => {
  it('sem pedidos: "PEDIR / Nada para pedir hoje."; sem skip a seção some', () => {
    const texto = gerarMensagem({
      nomeDono: 'Dona Maria',
      data: '2026-11-15',
      canal: 'telegram',
      itens: ordenarParaMensagem([banana]),
    });
    expect(texto).toBe(
      [
        'Bom dia, Dona Maria! Sugestão de hoje (dom 15/11):',
        '',
        'PEDIR',
        'Nada para pedir hoje.',
        '',
        'NÃO REPOR HOJE',
        'Banana (estoque p/ 3 dias)',
      ].join('\n'),
    );
  });

  it('só pedidos: sem a seção NÃO REPOR HOJE e sem encalhe', () => {
    const texto = gerarMensagem({
      nomeDono: 'Seu Antônio',
      data: '2026-11-14',
      canal: 'telegram',
      itens: ordenarParaMensagem([cebola]),
    });
    expect(texto).toBe(
      [
        'Bom dia, Seu Antônio! Sugestão de hoje (sáb 14/11):',
        '',
        'PEDIR',
        '1. Cebola — 20 kg (tem ~8, vende ~10/dia)',
      ].join('\n'),
    );
  });
});

describe('estimativa fraca', () => {
  it('marca a linha com " *" e acrescenta a nota no fim (antes da linha do canal manual)', () => {
    const fraca = { ...cebola, estimativaFraca: true };
    const itens = ordenarParaMensagem([tomate, fraca]);
    const base = [
      'Bom dia, Seu Antônio! Sugestão de hoje (qui 12/11):',
      '',
      'PEDIR',
      '1. Tomate — 40 kg (tem ~15, vende ~25/dia)',
      '2. Cebola — 20 kg (tem ~8, vende ~10/dia) *',
      '',
      '* estoque estimado sem contagem recente. Mande /estoque item qtd para corrigir.',
    ];
    expect(
      gerarMensagem({ nomeDono: 'Seu Antônio', data: '2026-11-12', canal: 'telegram', itens }),
    ).toBe(base.join('\n'));
    expect(
      gerarMensagem({ nomeDono: 'Seu Antônio', data: '2026-11-12', canal: 'manual', itens }),
    ).toBe(
      [
        ...base,
        '',
        'Responda *ok* para aceitar, ou o número e a quantidade para ajustar (ex.: 1 35).',
      ].join('\n'),
    );
  });

  it('marca também encalhe e não repor', () => {
    const itens = ordenarParaMensagem([
      { ...mamao, estimativaFraca: true },
      { ...banana, estimativaFraca: true },
    ]);
    const texto = gerarMensagem({ nomeDono: 'X', data: '2026-11-12', canal: 'telegram', itens });
    expect(texto).toContain('Vale promoção hoje. *');
    expect(texto).toContain('Banana (estoque p/ 3 dias) *');
    expect(texto.endsWith('corrigir.')).toBe(true);
  });

  it('sem item fraco não há nota', () => {
    const texto = gerarMensagem({
      nomeDono: 'X',
      data: '2026-11-12',
      canal: 'telegram',
      itens: ordenarParaMensagem(TODOS),
    });
    expect(texto).not.toContain('*');
  });
});

describe('limite de 12 itens', () => {
  const pedidos = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      item({
        nome: `Item ${String(i + 1).padStart(2, '0')}`,
        quantidadeSugerida: 10,
        valorPedido: 1000 - i, // Item 01 é o de maior valor
        motivo: 'tem ~1 kg, vende ~2 kg/dia',
      }),
    );
  const linhas = (texto: string) => texto.split('\n');

  it('15 pedidos: mostra 12 e avisa dos 3 restantes (telegram)', () => {
    const texto = gerarMensagem({
      nomeDono: 'Seu Antônio',
      data: '2026-11-12',
      canal: 'telegram',
      itens: ordenarParaMensagem(pedidos(15)),
    });
    const l = linhas(texto);
    expect(l.filter((x) => /^\d+\. /.test(x))).toHaveLength(12);
    expect(l).toContain('12. Item 12 — 10 kg (tem ~1, vende ~2/dia)');
    expect(texto).not.toContain('Item 13');
    expect(l[l.length - 1]).toBe('… e mais 3 itens para pedir — responda tudo para ver.');
  });

  it('no manual o "tudo" vai com asteriscos', () => {
    const texto = gerarMensagem({
      nomeDono: 'Seu Antônio',
      data: '2026-11-12',
      canal: 'manual',
      itens: ordenarParaMensagem(pedidos(13)),
    });
    expect(texto).toContain('… e mais 1 item para pedir — responda *tudo* para ver.');
  });

  it('encalhe + pedido somam 12: 2 encalhes deixam 10 vagas de pedido', () => {
    const encalhes = [
      mamao,
      item({
        nome: 'Abacate',
        acao: 'risk',
        quantidadeSugerida: 0,
        motivo: 'vendendo abaixo do ritmo, tem ~9 kg',
      }),
    ];
    const texto = gerarMensagem({
      nomeDono: 'Seu Antônio',
      data: '2026-11-12',
      canal: 'telegram',
      itens: ordenarParaMensagem([...encalhes, ...pedidos(13)]),
    });
    const l = linhas(texto);
    expect(l.filter((x) => x.startsWith('⚠️'))).toHaveLength(2);
    expect(l.filter((x) => /^\d+\. /.test(x))).toHaveLength(10);
    expect(l).toContain('… e mais 3 itens para pedir — responda tudo para ver.');
  });

  it('exatamente 12 pedidos: nenhuma linha de limite', () => {
    const texto = gerarMensagem({
      nomeDono: 'Seu Antônio',
      data: '2026-11-12',
      canal: 'telegram',
      itens: ordenarParaMensagem(pedidos(12)),
    });
    expect(texto).not.toContain('…');
  });

  it('os itens não repor continuam aparecendo além do limite', () => {
    const texto = gerarMensagem({
      nomeDono: 'Seu Antônio',
      data: '2026-11-12',
      canal: 'telegram',
      itens: ordenarParaMensagem([...pedidos(15), banana]),
    });
    expect(texto).toContain('NÃO REPOR HOJE\nBanana (estoque p/ 3 dias)');
  });
});
