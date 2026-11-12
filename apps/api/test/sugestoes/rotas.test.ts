import { painelHojeSchema, sugestaoSchema, type PainelHoje, type Sugestao } from '@giro/shared';
import { describe, expect, it, vi } from 'vitest';
import { criarServidor } from '../../src/app';
import { ErroHttp } from '../../src/erros';

const sugestao: Sugestao = {
  id: 2,
  lojaId: 1,
  data: '2026-11-09',
  geradaEm: '2026-11-09T08:30:00.000Z',
  status: 'draft',
  canal: 'manual',
  mensagem: 'Bom dia!',
  enviadaEm: null,
  itens: [],
};

const painel: PainelHoje = {
  data: '2026-11-09',
  lojas: [
    {
      loja: {
        id: 1,
        nome: 'Loja',
        nomeDono: 'Seu Antônio',
        whatsapp: null,
        canal: 'manual',
        telegramVinculado: false,
        envioAutomatico: false,
        sistemaPdv: null,
        fusoHorario: 'America/Sao_Paulo',
        mapeamentoColunas: null,
      },
      sugestao,
      importacoesPendentes: 0,
      ultimoDiaComVendas: '2026-11-08',
    },
  ],
  inboxAbertas: 0,
};

function criarApp() {
  const sugestoes = {
    gerar: vi.fn((_id: number, _o: unknown) => Promise.resolve(sugestao)),
    buscarPorData: vi.fn((_id: number, _d: string) => Promise.resolve(sugestao)),
    enviar: vi.fn((_id: number) => Promise.resolve(sugestao)),
    painelHoje: vi.fn((_d?: string) => Promise.resolve(painel)),
    expirarPendentes: vi.fn(() => Promise.resolve(0)),
    executarRotinaDiaria: vi.fn(),
  };
  const app = criarServidor({
    verificarBanco: async () => {},
    statusBot: () => 'desativado',
    servicos: { sugestoes },
  });
  return { app, sugestoes };
}

describe('rotas de sugestões', () => {
  it('POST /stores/:id/suggestions/run aceita corpo vazio', async () => {
    const { app, sugestoes } = criarApp();
    const res = await app.inject({ method: 'POST', url: '/stores/1/suggestions/run' });
    expect(res.statusCode).toBe(200);
    expect(sugestaoSchema.parse(res.json())).toEqual(sugestao);
    expect(sugestoes.gerar).toHaveBeenCalledWith(1, { refazer: false });
  });

  it('POST run repassa data e refazer', async () => {
    const { app, sugestoes } = criarApp();
    const res = await app.inject({
      method: 'POST',
      url: '/stores/1/suggestions/run',
      payload: { data: '2026-11-09', refazer: true },
    });
    expect(res.statusCode).toBe(200);
    expect(sugestoes.gerar).toHaveBeenCalledWith(1, { data: '2026-11-09', refazer: true });
  });

  it('POST run rejeita data inválida', async () => {
    const { app, sugestoes } = criarApp();
    const res = await app.inject({
      method: 'POST',
      url: '/stores/1/suggestions/run',
      payload: { data: 'ontem' },
    });
    expect(res.statusCode).toBe(400);
    expect(sugestoes.gerar).not.toHaveBeenCalled();
  });

  it('GET /stores/:id/suggestions/:date devolve a sugestão', async () => {
    const { app, sugestoes } = criarApp();
    const res = await app.inject({ method: 'GET', url: '/stores/1/suggestions/2026-11-09' });
    expect(res.statusCode).toBe(200);
    expect(sugestaoSchema.parse(res.json())).toEqual(sugestao);
    expect(sugestoes.buscarPorData).toHaveBeenCalledWith(1, '2026-11-09');
  });

  it('GET por data inválida dá 400 e inexistente dá 404', async () => {
    const { app, sugestoes } = criarApp();
    const invalida = await app.inject({ method: 'GET', url: '/stores/1/suggestions/hoje' });
    expect(invalida.statusCode).toBe(400);
    sugestoes.buscarPorData.mockRejectedValueOnce(new ErroHttp(404, 'Sugestão não encontrada'));
    const res = await app.inject({ method: 'GET', url: '/stores/1/suggestions/2026-11-09' });
    expect(res.statusCode).toBe(404);
  });

  it('POST /suggestions/:id/send envia e propaga erros do serviço', async () => {
    const { app, sugestoes } = criarApp();
    const ok = await app.inject({ method: 'POST', url: '/suggestions/2/send' });
    expect(ok.statusCode).toBe(200);
    expect(sugestaoSchema.parse(ok.json())).toEqual(sugestao);
    expect(sugestoes.enviar).toHaveBeenCalledWith(2);

    sugestoes.enviar.mockRejectedValueOnce(new ErroHttp(502, 'Falha ao enviar pelo Telegram: x'));
    const falha = await app.inject({ method: 'POST', url: '/suggestions/2/send' });
    expect(falha.statusCode).toBe(502);
    const invalido = await app.inject({ method: 'POST', url: '/suggestions/abc/send' });
    expect(invalido.statusCode).toBe(400);
  });

  it('GET /today devolve o painel, com e sem data', async () => {
    const { app, sugestoes } = criarApp();
    const res = await app.inject({ method: 'GET', url: '/today?date=2026-11-09' });
    expect(res.statusCode).toBe(200);
    expect(painelHojeSchema.parse(res.json())).toEqual(painel);
    expect(sugestoes.painelHoje).toHaveBeenCalledWith('2026-11-09');
    await app.inject({ method: 'GET', url: '/today' });
    expect(sugestoes.painelHoje).toHaveBeenLastCalledWith(undefined);
    const invalida = await app.inject({ method: 'GET', url: '/today?date=x' });
    expect(invalida.statusCode).toBe(400);
  });
});
