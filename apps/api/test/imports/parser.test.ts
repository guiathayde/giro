import { describe, expect, it } from 'vitest';
import { detectarDelimitador, lerTabela } from '../../src/modules/imports/arquivo';
import {
  detectarFormatoNumero,
  parseData,
  parseNumero,
  parsearVendas,
} from '../../src/modules/imports/parser';
import {
  ARQUIVO_28_DIAS_CSV,
  ARQUIVO_28_DIAS_XLS,
  ARQUIVO_28_DIAS_XLSX,
  ARQUIVO_UM_DIA_CSV,
  lerFixture,
  texto,
} from './fixtures';

// Valores conferidos fora do parser (Python lendo o CSV em cp1252) — ver docs/DECISIONS.md.
const ESPERADO_28_DIAS = {
  linhas: 717,
  dias: 28,
  descricoes: 26,
  quantidadeTotal: 9217.794,
  valorTotal: 45104.15, // = linha "TOTAL GERAL" do próprio arquivo
};

const soma = (valores: number[], casas: number) =>
  Math.round(valores.reduce((s, v) => s + v, 0) * 10 ** casas) / 10 ** casas;

function parsearFixture(nome: string) {
  const resultado = parsearVendas(lerTabela(lerFixture(nome), nome));
  if (!resultado.ok) throw new Error(`parse falhou: ${resultado.erro}`);
  return resultado;
}

describe('parser — exportação de 28 dias em CSV (Windows-1252, ;)', () => {
  const resultado = parsearFixture(ARQUIVO_28_DIAS_CSV);

  it('detecta separador ; e as colunas pelo cabeçalho, ignorando "Vl. Unit."', () => {
    expect(lerTabela(lerFixture(ARQUIVO_28_DIAS_CSV), ARQUIVO_28_DIAS_CSV).delimitador).toBe(';');
    expect(resultado.colunas).toEqual({
      data: 'Data',
      codigo: 'Código',
      descricao: 'Descrição',
      quantidade: 'Qtde',
      valor: 'Vl. Total',
    });
  });

  it('lê todas as linhas de venda, pulando título e TOTAL GERAL', () => {
    expect(resultado.linhas).toHaveLength(ESPERADO_28_DIAS.linhas);
    expect(resultado.descartadas).toEqual([{ motivo: 'linha de total', linhas: 1 }]);
    expect(new Set(resultado.linhas.map((l) => l.data)).size).toBe(ESPERADO_28_DIAS.dias);
    expect(new Set(resultado.linhas.map((l) => l.descricao)).size).toBe(
      ESPERADO_28_DIAS.descricoes,
    );
  });

  it('soma de quantidade e valor bate com a linha TOTAL GERAL (que não pode ser contada)', () => {
    expect(
      soma(
        resultado.linhas.map((l) => l.quantidade),
        3,
      ),
    ).toBe(ESPERADO_28_DIAS.quantidadeTotal);
    expect(
      soma(
        resultado.linhas.map((l) => l.valor ?? 0),
        2,
      ),
    ).toBe(ESPERADO_28_DIAS.valorTotal);
  });

  it('decodifica acentos do Windows-1252 e mantém a descrição original', () => {
    const descricoes = new Set(resultado.linhas.map((l) => l.descricao));
    expect(descricoes).toContain('MAMÃO FORMOSA KG');
    expect(descricoes).toContain('MAÇÃ GALA KG');
    expect(descricoes).toContain('Limão Taiti kg');
  });

  it('converte data dd/mm/aaaa, peso com 3 casas e devolução negativa', () => {
    expect(resultado.periodo).toEqual({ inicio: '2026-10-12', fim: '2026-11-08' });
    expect(resultado.linhas[0]).toEqual({
      data: '2026-10-12',
      codigo: '1001',
      descricao: 'TOMATE KG',
      quantidade: 9.299,
      valor: 83.6,
    });
    const devolucao = resultado.linhas.find((l) => l.quantidade < 0);
    expect(devolucao).toMatchObject({ data: '2026-10-20', quantidade: -1.25, valor: -11.24 });
  });
});

describe.each([ARQUIVO_28_DIAS_XLSX, ARQUIVO_28_DIAS_XLS])(
  'parser — mesma exportação em planilha (%s)',
  (arquivo) => {
    const csv = parsearFixture(ARQUIVO_28_DIAS_CSV);
    const planilha = parsearFixture(arquivo);

    it('produz as mesmas linhas do CSV (datas de célula sem deslocar o dia)', () => {
      expect(planilha.periodo).toEqual(csv.periodo);
      expect(planilha.linhas).toEqual(csv.linhas);
      expect(
        soma(
          planilha.linhas.map((l) => l.valor ?? 0),
          2,
        ),
      ).toBe(ESPERADO_28_DIAS.valorTotal);
    });
  },
);

describe('parser — relatório de um dia sem coluna de data (UTF-8, vírgula, ponto decimal)', () => {
  const resultado = parsearFixture(ARQUIVO_UM_DIA_CSV);

  it('usa a data do título e ignora "Gerado em"', () => {
    expect(resultado.periodo).toEqual({ inicio: '2026-11-10', fim: '2026-11-10' });
    expect(new Set(resultado.linhas.map((l) => l.data))).toEqual(new Set(['2026-11-10']));
  });

  it('detecta vírgula como separador e ponto como decimal na coluna inteira', () => {
    expect(resultado.colunas).toMatchObject({
      descricao: 'Produto',
      quantidade: 'Qtd Vendida',
      valor: 'Valor Total (R$)',
      data: null,
    });
    expect(resultado.linhas.map((l) => [l.descricao, l.quantidade, l.valor])).toEqual([
      ['Tomate KG', 23.415, 210.5],
      ['Banana nanica, kg', 27.8, 138.72],
      ['Alface crespa UN', 31, 108.19],
      ['Cebola KG', 9.35, 51.33],
      ['Manga Palmer KG', 4.1, 32.76],
    ]);
    expect(
      soma(
        resultado.linhas.map((l) => l.valor ?? 0),
        2,
      ),
    ).toBe(541.5);
  });
});

describe('parser — casos de erro e planilha manual', () => {
  it('aceita a planilha modelo preenchida à mão (data;item;qtd)', () => {
    const tabela = lerTabela(
      texto('data;item;qtd\n10/11/2026;Tomate;20,5\n10/11/2026;Alface;30\n'),
      'planilha.csv',
    );
    const resultado = parsearVendas(tabela);
    expect(resultado.ok && resultado.linhas).toEqual([
      { data: '2026-11-10', descricao: 'Tomate', codigo: null, quantidade: 20.5, valor: null },
      { data: '2026-11-10', descricao: 'Alface', codigo: null, quantidade: 30, valor: null },
    ]);
  });

  it('recusa relatório de vários dias somados sem coluna de data', () => {
    const tabela = lerTabela(
      texto('Período: 01/11/2026 a 07/11/2026\nProduto;Qtde\nTomate;150,5\n'),
      'semana.csv',
    );
    const resultado = parsearVendas(tabela);
    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.erro).toMatch(/soma vários dias \(01\/11 a 07\/11\)/);
  });

  it('recusa arquivo sem data nenhuma, em vez de assumir o dia de hoje', () => {
    const resultado = parsearVendas(lerTabela(texto('Produto;Qtde\nTomate;10\n'), 'x.csv'));
    expect(resultado).toMatchObject({ ok: false, cabecalhos: ['Produto', 'Qtde'] });
  });

  it('sem colunas reconhecíveis, devolve os cabeçalhos para o operador mapear', () => {
    const tabela = lerTabela(texto('Dt;Mercad.;Peso Liq\n10/11/2026;Tomate;10\n'), 'x.csv');
    expect(parsearVendas(tabela)).toEqual({
      ok: false,
      erro: 'Não encontrei as colunas de descrição e quantidade no arquivo.',
      cabecalhos: ['Dt', 'Mercad.', 'Peso Liq'],
    });
  });

  it('com o mapeamento de colunas salvo na loja, lê o mesmo arquivo', () => {
    const tabela = lerTabela(texto('Dt;Mercad.;Peso Liq\n10/11/2026;Tomate;10,5\n'), 'x.csv');
    const resultado = parsearVendas(tabela, { descricao: 'Mercad.', quantidade: 'Peso Liq' });
    expect(resultado.ok && resultado.linhas).toEqual([
      { data: '2026-11-10', descricao: 'Tomate', codigo: null, quantidade: 10.5, valor: null },
    ]);
  });

  it('mapeamento salvo de outro layout não impede a detecção automática', () => {
    const tabela = lerTabela(lerFixture(ARQUIVO_28_DIAS_CSV), ARQUIVO_28_DIAS_CSV);
    const resultado = parsearVendas(tabela, { descricao: 'Mercad.', quantidade: 'Peso Liq' });
    expect(resultado.ok && resultado.linhas).toHaveLength(ESPERADO_28_DIAS.linhas);
  });

  it('quantidade ambígua usa o formato que a coluna de valor indica (não lê 18.350 kg como 18 mil)', () => {
    const tabela = lerTabela(
      texto('Data;Produto;Qtde;Total\n10/11/2026;Tomate;18.350;164.97\n'),
      'x.csv',
    );
    const resultado = parsearVendas(tabela);
    expect(resultado.ok && resultado.linhas[0]).toMatchObject({ quantidade: 18.35, valor: 164.97 });
  });

  it('se nenhuma coluna resolve, vale o separador do arquivo (; = formato brasileiro)', () => {
    const tabela = lerTabela(texto('Data;Produto;Qtde\n10/11/2026;Tomate;1.200\n'), 'x.csv');
    const resultado = parsearVendas(tabela);
    expect(resultado.ok && resultado.linhas[0]?.quantidade).toBe(1200);
  });

  it('devolve a linha de cabeçalho inteira também quando lê o arquivo', () => {
    const resultado = parsearVendas(
      lerTabela(lerFixture(ARQUIVO_28_DIAS_CSV), ARQUIVO_28_DIAS_CSV),
    );
    expect(resultado.ok && resultado.cabecalhos).toEqual([
      'Data',
      'Código',
      'Descrição',
      'Un',
      'Qtde',
      'Vl. Unit.',
      'Vl. Total',
    ]);
  });

  it('descarta linha com quantidade ou data inválida, contando o motivo', () => {
    const tabela = lerTabela(
      texto(
        'Data;Produto;Qtde\n10/11/2026;Tomate;10\n31/02/2026;Cebola;3\n10/11/2026;Alface;abc\n',
      ),
      'x.csv',
    );
    const resultado = parsearVendas(tabela);
    expect(resultado.ok && resultado.linhas).toHaveLength(1);
    expect(resultado.ok && resultado.descartadas).toEqual([
      { motivo: 'data inválida', linhas: 1 },
      { motivo: 'quantidade inválida', linhas: 1 },
    ]);
  });
});

describe('números, datas e separador', () => {
  it.each([
    ['1.234,56', 'br', 1234.56],
    ['18,350', 'br', 18.35],
    ['R$ 10,00', 'br', 10],
    ['-1,250', 'br', -1.25],
    ['(3,50)', 'br', -3.5],
    ['1,50-', 'br', -1.5],
    ['1,234.56', 'us', 1234.56],
    ['18.350', 'us', 18.35],
    ['abc', 'br', null],
    ['', 'br', null],
  ] as const)('parseNumero(%s, %s) = %s', (entrada, formato, esperado) => {
    expect(parseNumero(entrada, formato)).toBe(esperado);
  });

  it('decide o formato pela coluna inteira; null quando nada na coluna resolve', () => {
    expect(detectarFormatoNumero(['18.350', '27.8'])).toBe('us');
    expect(detectarFormatoNumero(['18.350', '1.200'])).toBeNull();
    expect(detectarFormatoNumero(['9,299', '35'])).toBe('br');
    expect(detectarFormatoNumero(['1.234,56'])).toBe('br');
    expect(detectarFormatoNumero(['R$ 10,00'])).toBe('br');
    expect(detectarFormatoNumero(['KG', 'UN'])).toBeNull();
  });

  it.each([
    ['10/11/2026', '2026-11-10'],
    ['10/11/26', '2026-11-10'],
    ['1/2/2026', '2026-02-01'],
    ['10/11/2026 08:15:00', '2026-11-10'],
    ['2026-11-10', '2026-11-10'],
    ['31/02/2026', null],
    ['texto', null],
  ])('parseData(%s) = %s', (entrada, esperado) => {
    expect(parseData(entrada)).toBe(esperado);
  });

  it('serial de data do Excel vira dia sem fuso', () => {
    expect(parseData(46336)).toBe('2026-11-10');
  });

  it('detecta separador mesmo com vírgula decimal no meio', () => {
    expect(detectarDelimitador('a;b;c\n1;2,5;3,25\n4;5;6,1\n')).toBe(';');
    expect(detectarDelimitador('a,b,c\n1,"2,5",3\n')).toBe(',');
    expect(detectarDelimitador('a\tb\tc\n1\t2,5\t3\n')).toBe('\t');
  });
});
