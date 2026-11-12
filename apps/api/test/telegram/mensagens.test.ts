import type { Importacao, ResumoImportacao } from '@giro/shared';
import { describe, expect, it } from 'vitest';
import { mensagemImportacao } from '../../src/modules/telegram/mensagens';

const importacao: Importacao = {
  id: 1,
  lojaId: 1,
  origem: 'telegram',
  nomeArquivo: 'vendas.csv',
  inicioPeriodo: '2026-11-10',
  fimPeriodo: '2026-11-10',
  linhasTotal: 142,
  linhasMapeadas: 130,
  linhasNaoMapeadas: 12,
  status: 'done',
  erro: null,
  criadoEm: '2026-11-11T09:00:00.000Z',
};

const resumo = (parcial: Partial<ResumoImportacao> = {}): ResumoImportacao => ({
  importacao,
  colunas: null,
  cabecalhos: [],
  naoMapeados: [],
  descartadas: [],
  ...parcial,
});

const naoMapeado = (normalizada: string) => ({
  normalizada,
  descricao: normalizada,
  codigo: null,
  linhas: 4,
  quantidade: 10,
});

describe('mensagemImportacao', () => {
  it('um dia, com itens não reconhecidos', () => {
    expect(mensagemImportacao(resumo({ naoMapeados: ['A', 'B', 'C'].map(naoMapeado) }))).toBe(
      'Recebi! 142 linhas de venda do dia 10/11. 3 itens que não reconheci (o operador vai mapear).',
    );
  });

  it('período com milhar e tudo reconhecido', () => {
    expect(
      mensagemImportacao(
        resumo({
          importacao: {
            ...importacao,
            inicioPeriodo: '2026-10-12',
            fimPeriodo: '2026-11-08',
            linhasTotal: 1717,
          },
        }),
      ),
    ).toBe('Recebi! 1.717 linhas de venda de 12/10 a 08/11. Reconheci todos os produtos.');
  });

  it('singular', () => {
    expect(
      mensagemImportacao(
        resumo({ importacao: { ...importacao, linhasTotal: 1 }, naoMapeados: [naoMapeado('A')] }),
      ),
    ).toBe(
      'Recebi! 1 linha de venda do dia 10/11. 1 item que não reconheci (o operador vai mapear).',
    );
  });

  it('arquivo que não deu para ler', () => {
    expect(
      mensagemImportacao(
        resumo({
          importacao: {
            ...importacao,
            status: 'error',
            erro: 'Não encontrei as colunas de descrição e quantidade no arquivo.',
            linhasTotal: 0,
          },
        }),
      ),
    ).toBe(
      'Não consegui ler esse arquivo: Não encontrei as colunas de descrição e quantidade no arquivo. O operador vai dar uma olhada.',
    );
  });
});
