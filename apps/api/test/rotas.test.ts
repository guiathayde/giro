import type { ResumoImportacao } from '@giro/shared';
import { describe, expect, it, vi } from 'vitest';
import { criarServidor } from '../src/app';
import { ErroHttp } from '../src/erros';
import type { EntradaImportacao } from '../src/modules/imports/service';
import { ARQUIVO_28_DIAS_CSV, ARQUIVO_28_DIAS_XLSX, lerFixture } from './imports/fixtures';

const resumoFake = (entrada: EntradaImportacao): ResumoImportacao => ({
  importacao: {
    id: 9,
    lojaId: entrada.lojaId,
    origem: entrada.origem,
    nomeArquivo: entrada.nomeArquivo,
    inicioPeriodo: null,
    fimPeriodo: null,
    linhasTotal: 0,
    linhasMapeadas: 0,
    linhasNaoMapeadas: 0,
    status: 'done',
    erro: null,
    criadoEm: '2026-11-12T10:00:00.000Z',
  },
  colunas: null,
  cabecalhos: [],
  naoMapeados: [],
  descartadas: [],
});

function criarApp() {
  const importacoes = {
    importar: vi.fn((e: EntradaImportacao) => Promise.resolve(resumoFake(e))),
    reprocessar: vi.fn(),
    mapear: vi.fn(() => Promise.reject(new ErroHttp(404, 'Importação não encontrada'))),
    listar: vi.fn(() => Promise.resolve([])),
    detalhe: vi.fn(),
  };
  const lojas = {
    listar: vi.fn(() => Promise.resolve([])),
    itens: vi.fn(),
    salvarMapeamentoColunas: vi.fn(),
    linkTelegram: vi.fn(),
  };
  const app = criarServidor({
    verificarBanco: async () => {},
    statusBot: () => 'desativado',
    servicos: { lojas, importacoes },
  });
  return { app, importacoes, lojas };
}

function multipart(nomeArquivo: string, conteudo: Uint8Array, campo = 'arquivo') {
  const fronteira = '----giro-teste';
  const corpo = Buffer.concat([
    Buffer.from(
      `--${fronteira}\r\nContent-Disposition: form-data; name="${campo}"; filename="${nomeArquivo}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    Buffer.from(conteudo),
    Buffer.from(`\r\n--${fronteira}--\r\n`),
  ]);
  return {
    payload: corpo,
    headers: { 'content-type': `multipart/form-data; boundary=${fronteira}` },
  };
}

describe('POST /stores/:id/imports', () => {
  it('recebe o CSV de exemplo inteiro, byte a byte', async () => {
    const { app, importacoes } = criarApp();
    const arquivo = lerFixture(ARQUIVO_28_DIAS_CSV);

    const res = await app.inject({
      method: 'POST',
      url: '/stores/1/imports',
      ...multipart(ARQUIVO_28_DIAS_CSV, arquivo),
    });

    expect(res.statusCode).toBe(201);
    expect(importacoes.importar).toHaveBeenCalledWith({
      lojaId: 1,
      origem: 'pdv_csv',
      nomeArquivo: ARQUIVO_28_DIAS_CSV,
      conteudo: arquivo,
    });
  });

  it('marca XLSX como pdv_xlsx', async () => {
    const { app, importacoes } = criarApp();
    await app.inject({
      method: 'POST',
      url: '/stores/1/imports',
      ...multipart(ARQUIVO_28_DIAS_XLSX, lerFixture(ARQUIVO_28_DIAS_XLSX)),
    });
    expect(importacoes.importar.mock.calls[0]?.[0].origem).toBe('pdv_xlsx');
  });

  it('recusa formato não suportado com 400', async () => {
    const { app, importacoes } = criarApp();
    const res = await app.inject({
      method: 'POST',
      url: '/stores/1/imports',
      ...multipart('fechamento.pdf', new Uint8Array([1])),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ erro: 'Formato não suportado. Use .csv, .txt, .xlsx, .xls.' });
    expect(importacoes.importar).not.toHaveBeenCalled();
  });

  it('recusa id de loja inválido com 400', async () => {
    const { app } = criarApp();
    const res = await app.inject({
      method: 'POST',
      url: '/stores/abc/imports',
      ...multipart('a.csv', new Uint8Array([1])),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ erro: 'Dados inválidos' });
  });
});

describe('POST /imports/:id/map', () => {
  it('valida o corpo com Zod', async () => {
    const { app, importacoes } = criarApp();
    const res = await app.inject({
      method: 'POST',
      url: '/imports/1/map',
      payload: { mapeamentos: [] },
    });
    expect(res.statusCode).toBe(400);
    expect(importacoes.mapear).not.toHaveBeenCalled();
  });

  it('repassa o status do erro de domínio', async () => {
    const { app } = criarApp();
    const res = await app.inject({
      method: 'POST',
      url: '/imports/99/map',
      payload: { mapeamentos: [{ normalizada: 'BATATA DOCE', itemId: null }] },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ erro: 'Importação não encontrada' });
  });
});
