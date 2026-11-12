import { itemSugestaoSchema, sugestaoSchema, type ItemSugestao, type Sugestao } from '@giro/shared';
import { describe, expect, it, vi } from 'vitest';
import { criarServidor } from '../../src/app';
import { ErroHttp } from '../../src/erros';

const item: ItemSugestao = {
  id: 7,
  itemId: 3,
  itemNome: 'Tomate',
  unidade: 'kg',
  acao: 'order',
  posicao: 1,
  quantidadeSugerida: 40,
  previsao: 55,
  estoqueEstimado: 15,
  diasCobertura: 1,
  estimativaFraca: false,
  motivo: 'tem ~15 kg, vende ~25 kg/dia',
  resposta: 'adjusted',
  quantidadeResposta: 30,
  motivoResposta: null,
  notaResposta: null,
  respondidoEm: '2026-11-12T11:00:00.000Z',
};

const sugestao: Sugestao = {
  id: 2,
  lojaId: 1,
  data: '2026-11-12',
  geradaEm: '2026-11-12T09:00:00.000Z',
  status: 'answered',
  canal: 'telegram',
  mensagem: null,
  enviadaEm: '2026-11-12T09:30:00.000Z',
  itens: [item],
};

function criarApp() {
  const respostas = {
    registrar: vi.fn((_id: number, _d: unknown) => Promise.resolve(item)),
    aceitarTudo: vi.fn((_id: number) => Promise.resolve(sugestao)),
  };
  const app = criarServidor({
    verificarBanco: async () => {},
    statusBot: () => 'desativado',
    servicos: { respostas },
  });
  return { app, respostas };
}

describe('rotas de respostas', () => {
  it('POST /suggestion-items/:id/response registra e devolve o item', async () => {
    const { app, respostas } = criarApp();
    const res = await app.inject({
      method: 'POST',
      url: '/suggestion-items/7/response',
      payload: { resposta: 'adjusted', quantidade: 30, motivo: 'price' },
    });
    expect(res.statusCode).toBe(200);
    expect(itemSugestaoSchema.parse(res.json())).toEqual(item);
    expect(respostas.registrar).toHaveBeenCalledWith(7, {
      resposta: 'adjusted',
      quantidade: 30,
      motivo: 'price',
    });
  });

  it('rejeita resposta inválida e id inválido com 400', async () => {
    const { app, respostas } = criarApp();
    const ajusteSemQtd = await app.inject({
      method: 'POST',
      url: '/suggestion-items/7/response',
      payload: { resposta: 'adjusted' },
    });
    const respostaDesconhecida = await app.inject({
      method: 'POST',
      url: '/suggestion-items/7/response',
      payload: { resposta: 'talvez' },
    });
    const idRuim = await app.inject({
      method: 'POST',
      url: '/suggestion-items/abc/response',
      payload: { resposta: 'accepted' },
    });
    expect([ajusteSemQtd, respostaDesconhecida, idRuim].map((r) => r.statusCode)).toEqual([
      400, 400, 400,
    ]);
    expect(respostas.registrar).not.toHaveBeenCalled();
  });

  it('propaga o erro do serviço (rascunho e inexistente)', async () => {
    const { app, respostas } = criarApp();
    respostas.registrar.mockRejectedValueOnce(
      new ErroHttp(400, 'Envie a sugestão antes de registrar respostas'),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/suggestion-items/7/response',
      payload: { resposta: 'accepted' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ erro: 'Envie a sugestão antes de registrar respostas' });

    respostas.aceitarTudo.mockRejectedValueOnce(new ErroHttp(404, 'Sugestão não encontrada'));
    const res404 = await app.inject({ method: 'POST', url: '/suggestions/99/accept-all' });
    expect(res404.statusCode).toBe(404);
  });

  it('POST /suggestions/:id/accept-all devolve a sugestão', async () => {
    const { app, respostas } = criarApp();
    const res = await app.inject({ method: 'POST', url: '/suggestions/2/accept-all' });
    expect(res.statusCode).toBe(200);
    expect(sugestaoSchema.parse(res.json()).status).toBe('answered');
    expect(respostas.aceitarTudo).toHaveBeenCalledWith(2);
  });
});
