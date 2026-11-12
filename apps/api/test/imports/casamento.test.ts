import { describe, expect, it } from 'vitest';
import { lerTabela } from '../../src/modules/imports/arquivo';
import {
  agruparVendas,
  casarItem,
  criarIndiceItens,
  somarPorItemEDia,
} from '../../src/modules/imports/casamento';
import { normalizarDescricao } from '../../src/modules/imports/normalizacao';
import { parsearVendas } from '../../src/modules/imports/parser';
import { ARQUIVO_28_DIAS_CSV, CATALOGO, idDoItem, lerFixture } from './fixtures';

describe('normalizarDescricao', () => {
  it.each([
    ['TOMATE KG', 'TOMATE'],
    ['Mamão Formosa kg', 'MAMAO FORMOSA'],
    ['MAÇÃ GALA KG', 'MACA GALA'],
    ['  Banana nanica, kg ', 'BANANA NANICA'],
    ['COUVE MANTEIGA MC', 'COUVE MANTEIGA'],
    ['TOMATE/KG', 'TOMATE'],
    ['TOMATE CEREJA 300G', 'TOMATE CEREJA 300G'],
    ['KG', 'KG'],
  ])('%s → %s', (entrada, esperado) => {
    expect(normalizarDescricao(entrada)).toBe(esperado);
  });
});

describe('casamento com o catálogo', () => {
  const indice = criarIndiceItens(CATALOGO);

  it('casa por nome, por alias e ignorando acento e unidade', () => {
    expect(casarItem(indice, 'TOMATE KG', null)).toBe(idDoItem('Tomate'));
    expect(casarItem(indice, 'TOMATE CARMEN KG', null)).toBe(idDoItem('Tomate'));
    expect(casarItem(indice, 'MAMÃO FORMOSA KG', null)).toBe(idDoItem('Mamão formosa'));
    expect(casarItem(indice, 'Limão Taiti kg', null)).toBe(idDoItem('Limão taiti'));
    expect(casarItem(indice, 'BATATA DOCE KG', null)).toBeNull();
  });

  it('casa pelo código do PDV quando ele está nos aliases', () => {
    const indiceComCodigo = criarIndiceItens([{ id: 7, name: 'Chuchu', aliases: ['1018'] }]);
    expect(casarItem(indiceComCodigo, 'XUXU ESPECIAL', '1018')).toBe(7);
  });

  it('alias igual em dois itens é ambíguo e fica sem casar', () => {
    const ambiguo = criarIndiceItens([
      { id: 1, name: 'Limão taiti', aliases: ['LIMAO'] },
      { id: 2, name: 'Limão siciliano', aliases: ['LIMAO'] },
    ]);
    expect(casarItem(ambiguo, 'LIMAO KG', null)).toBeNull();
    expect(casarItem(ambiguo, 'LIMAO TAITI', null)).toBe(1);
  });
});

describe('agregação do arquivo de 28 dias', () => {
  const resultado = parsearVendas(lerTabela(lerFixture(ARQUIVO_28_DIAS_CSV), ARQUIVO_28_DIAS_CSV));
  if (!resultado.ok) throw new Error(resultado.erro);
  const ignoradas = new Set(['SACOLA PLASTICA']);
  const grupos = agruparVendas(resultado.linhas, criarIndiceItens(CATALOGO), ignoradas);
  const somas = somarPorItemEDia(grupos);

  it('soma linhas repetidas da mesma descrição no dia (troca de preço da banana)', () => {
    const banana = grupos.filter(
      (g) => g.data === '2026-10-30' && g.normalizada === 'BANANA NANICA',
    );
    expect(banana).toHaveLength(1);
    expect(banana[0]).toMatchObject({ quantidade: 27.655, linhas: 2 });
  });

  it('soma duas descrições do mesmo item e a devolução no total do dia', () => {
    // TOMATE KG 18,139 − 1,250 + TOMATE CARMEN KG 4,520
    expect(somas.get(`${idDoItem('Tomate')}|2026-10-20`)).toBe(21.409);
  });

  it('separa não mapeados de ignorados', () => {
    const naoMapeados = new Set(
      grupos.filter((g) => g.itemId === null && !g.ignorada).map((g) => g.normalizada),
    );
    expect(naoMapeados).toEqual(
      new Set(['BATATA DOCE', 'MANGA PALMER', 'OVOS BRANCOS GRANDES DZ', 'AGUA MINERAL 500ML']),
    );
    const linhasPorSituacao = { mapeadas: 0, naoMapeadas: 0, ignoradas: 0 };
    for (const g of grupos) {
      if (g.itemId !== null) linhasPorSituacao.mapeadas += g.linhas;
      else if (g.ignorada) linhasPorSituacao.ignoradas += g.linhas;
      else linhasPorSituacao.naoMapeadas += g.linhas;
    }
    expect(linhasPorSituacao).toEqual({ mapeadas: 588, naoMapeadas: 102, ignoradas: 27 });
  });

  it('todos os 20 itens do catálogo têm venda', () => {
    expect(new Set(grupos.flatMap((g) => (g.itemId === null ? [] : [g.itemId]))).size).toBe(20);
  });
});
