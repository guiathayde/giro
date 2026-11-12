import { describe, expect, it } from 'vitest';
import { parseAdjustments } from '../../src/modules/telegram/ajustes';
import { casarItens, parsearArgumentos } from '../../src/modules/telegram/comandos';
import { itemFalso } from './fabricas';

describe('parseAdjustments', () => {
  it.each([
    ['1 35', 1, 35],
    ['2 20,5', 2, 20.5],
    ['2 20.5', 2, 20.5],
    ['3 0', 3, 0],
    ['1-35', 1, 35],
    ['1: 35kg', 1, 35],
    ['1 = 35 kg', 1, 35],
    ['1) 35', 1, 35],
    ['  4    12   ', 4, 12],
    ['5 8 un', 5, 8],
    ['5 8 unid', 5, 8],
    ['6 3 maço', 6, 3],
    ['6 3 maco', 6, 3],
    ['6 3 mc', 6, 3],
    ['7 2 cx', 7, 2],
    ['7 2 CX', 7, 2],
  ])('entende "%s"', (texto, posicao, quantidade) => {
    expect(parseAdjustments(texto)).toEqual({ ajustes: [{ posicao, quantidade }], invalidas: [] });
  });

  it('separa por quebra de linha e por ponto e vírgula, sem quebrar a vírgula decimal', () => {
    expect(parseAdjustments('1 35\n2 20,5; 3 0')).toEqual({
      ajustes: [
        { posicao: 1, quantidade: 35 },
        { posicao: 2, quantidade: 20.5 },
        { posicao: 3, quantidade: 0 },
      ],
      invalidas: [],
    });
  });

  it('posição repetida: a última vale', () => {
    expect(parseAdjustments('1 35\n2 10\n1 40').ajustes).toEqual([
      { posicao: 1, quantidade: 40 },
      { posicao: 2, quantidade: 10 },
    ]);
  });

  it('ignora linhas vazias', () => {
    expect(parseAdjustments('\n\n 1 5 \n  \n;')).toEqual({
      ajustes: [{ posicao: 1, quantidade: 5 }],
      invalidas: [],
    });
  });

  it('devolve o que não entendeu', () => {
    expect(parseAdjustments('1 35\nbom dia\n2 muito')).toEqual({
      ajustes: [{ posicao: 1, quantidade: 35 }],
      invalidas: ['bom dia', '2 muito'],
    });
  });

  it('não confunde "135" com posição 13 e quantidade 5', () => {
    expect(parseAdjustments('135')).toEqual({ ajustes: [], invalidas: ['135'] });
  });

  it('texto sem nada válido', () => {
    expect(parseAdjustments('ok obrigado')).toEqual({ ajustes: [], invalidas: ['ok obrigado'] });
    expect(parseAdjustments('')).toEqual({ ajustes: [], invalidas: [] });
  });
});

describe('parsearArgumentos', () => {
  it.each([
    ['mamão 6', 'mamão', 6],
    ['mamão formosa 6,5', 'mamão formosa', 6.5],
    ['tomate 15kg', 'tomate', 15],
    ['tomate 15 kg', 'tomate', 15],
    ['alface 3 maço', 'alface', 3],
    ['  banana   2  ', 'banana', 2],
    ['mamão', 'mamão', null],
    ['', '', null],
    ['6', '', 6],
  ])('"%s"', (texto, termo, quantidade) => {
    expect(parsearArgumentos(texto)).toEqual({ termo, quantidade });
  });
});

describe('casarItens', () => {
  const itens = [
    itemFalso({ id: 1, nome: 'Mamão formosa', aliases: ['MAMAO FORMOSA KG'] }),
    itemFalso({ id: 2, nome: 'Mamão papaia' }),
    itemFalso({ id: 3, nome: 'Tomate italiano', aliases: ['TOM ITAL'] }),
    itemFalso({ id: 4, nome: 'Tomate', unidade: 'kg' }),
    itemFalso({ id: 5, nome: 'Tomate cereja', ativo: false }),
    itemFalso({ id: 6, nome: 'Alface crespa' }),
  ];
  const ids = (termo: string) => casarItens(termo, itens).map((i) => i.id);

  it('igualdade exata (sem acento e caixa) vence os parciais', () => {
    expect(ids('tomate')).toEqual([4]);
    expect(ids('MAMAO FORMOSA')).toEqual([1]);
  });

  it('começa com o termo', () => {
    expect(ids('mam')).toEqual([1, 2]);
  });

  it('contém todas as palavras, em qualquer ordem', () => {
    expect(ids('crespa alface')).toEqual([6]);
    expect(ids('italiano tomate')).toEqual([3]);
  });

  it('usa os aliases', () => {
    expect(ids('tom ital')).toEqual([3]);
  });

  it('ignora itens inativos', () => {
    expect(ids('tomate cereja')).toEqual([]);
  });

  it('nada encontrado ou termo vazio', () => {
    expect(ids('abacaxi')).toEqual([]);
    expect(ids('')).toEqual([]);
  });
});
