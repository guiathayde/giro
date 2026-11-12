import {
  contagemSchema,
  faltaSchema,
  perdaSchema,
  type Contagem,
  type Falta,
  type Perda,
} from '@giro/shared';
import { describe, expect, it, vi } from 'vitest';
import { criarServidor } from '../../src/app';
import { ErroHttp } from '../../src/erros';

const perda: Perda = {
  id: 1,
  lojaId: 1,
  itemId: 3,
  itemNome: 'Tomate',
  unidade: 'kg',
  data: '2026-11-12',
  quantidade: 2.5,
  valorEstimado: 10,
  motivo: 'spoiled',
  nota: null,
  criadoEm: '2026-11-12T12:00:00.000Z',
};
const falta: Falta = {
  id: 2,
  lojaId: 1,
  itemId: 3,
  itemNome: 'Tomate',
  data: '2026-11-12',
  nota: null,
};
const contagem: Contagem = {
  id: 3,
  lojaId: 1,
  itemId: 3,
  itemNome: 'Tomate',
  unidade: 'kg',
  quantidade: 12,
  contadoEm: '2026-11-12T12:00:00.000Z',
  origem: 'operator',
};

function criarApp() {
  const registros = {
    registrarPerda: vi.fn((_l: number, _d: unknown) => Promise.resolve(perda)),
    listarPerdas: vi.fn((_l: number, _f: unknown) => Promise.resolve([perda])),
    removerPerda: vi.fn((_id: number) => Promise.resolve()),
    registrarFalta: vi.fn((_l: number, _d: unknown) => Promise.resolve(falta)),
    listarFaltas: vi.fn((_l: number, _f: unknown) => Promise.resolve([falta])),
    removerFalta: vi.fn((_id: number) => Promise.resolve()),
    registrarContagem: vi.fn((_l: number, _d: unknown) => Promise.resolve(contagem)),
    listarContagens: vi.fn((_l: number, _f: unknown) => Promise.resolve([contagem])),
    removerContagem: vi.fn((_id: number) => Promise.resolve()),
  };
  const app = criarServidor({
    verificarBanco: async () => {},
    statusBot: () => 'desativado',
    servicos: { registros },
  });
  return { app, registros };
}

describe('rotas de registros', () => {
  it('POST /stores/:id/losses devolve 201 e aplica os padrões do schema', async () => {
    const { app, registros } = criarApp();
    const res = await app.inject({
      method: 'POST',
      url: '/stores/1/losses',
      payload: { itemId: 3, quantidade: 2.5 },
    });
    expect(res.statusCode).toBe(201);
    expect(perdaSchema.parse(res.json())).toEqual(perda);
    expect(registros.registrarPerda).toHaveBeenCalledWith(1, {
      itemId: 3,
      quantidade: 2.5,
      motivo: 'spoiled',
    });
  });

  it.each([
    ['/stores/1/losses', { itemId: 3, quantidade: 0 }],
    ['/stores/1/losses', { itemId: 3, quantidade: 1, data: '12/11/2026' }],
    ['/stores/1/losses', { itemId: 3, quantidade: 1, motivo: 'roubo' }],
    ['/stores/1/stockouts', { data: '2026-11-12' }],
    ['/stores/1/stock-counts', { itemId: 3, quantidade: -1 }],
    ['/stores/abc/stock-counts', { itemId: 3, quantidade: 1 }],
  ])('POST %s com corpo inválido devolve 400', async (url, payload) => {
    const { app, registros } = criarApp();
    const res = await app.inject({ method: 'POST', url, payload });
    expect(res.statusCode).toBe(400);
    expect(Object.values(registros).every((f) => f.mock.calls.length === 0)).toBe(true);
  });

  it('GET lista com filtro de período e valida as datas', async () => {
    const { app, registros } = criarApp();
    const res = await app.inject({
      method: 'GET',
      url: '/stores/1/losses?from=2026-11-01&to=2026-11-12',
    });
    expect(res.statusCode).toBe(200);
    expect(perdaSchema.array().parse(res.json())).toEqual([perda]);
    expect(registros.listarPerdas).toHaveBeenCalledWith(1, {
      from: '2026-11-01',
      to: '2026-11-12',
    });

    const ruim = await app.inject({ method: 'GET', url: '/stores/1/losses?from=ontem' });
    expect(ruim.statusCode).toBe(400);
  });

  it('faltas e contagens: criar (201) e listar', async () => {
    const { app, registros } = criarApp();
    const f = await app.inject({
      method: 'POST',
      url: '/stores/1/stockouts',
      payload: { itemId: 3 },
    });
    expect(f.statusCode).toBe(201);
    expect(faltaSchema.parse(f.json())).toEqual(falta);
    const c = await app.inject({
      method: 'POST',
      url: '/stores/1/stock-counts',
      payload: { itemId: 3, quantidade: 12 },
    });
    expect(c.statusCode).toBe(201);
    expect(contagemSchema.parse(c.json())).toEqual(contagem);
    expect(registros.registrarContagem).toHaveBeenCalledWith(1, {
      itemId: 3,
      quantidade: 12,
      origem: 'operator',
    });

    const lf = await app.inject({ method: 'GET', url: '/stores/1/stockouts' });
    expect(faltaSchema.array().parse(lf.json())).toHaveLength(1);
    const lc = await app.inject({ method: 'GET', url: '/stores/1/stock-counts?from=2026-11-12' });
    expect(contagemSchema.array().parse(lc.json())).toHaveLength(1);
  });

  it('DELETE devolve 204 e 404 quando não existe', async () => {
    const { app, registros } = criarApp();
    for (const url of ['/losses/1', '/stockouts/2', '/stock-counts/3']) {
      const res = await app.inject({ method: 'DELETE', url });
      expect(res.statusCode).toBe(204);
      expect(res.body).toBe('');
    }
    registros.removerPerda.mockRejectedValueOnce(new ErroHttp(404, 'Registro não encontrado'));
    const res = await app.inject({ method: 'DELETE', url: '/losses/99' });
    expect(res.statusCode).toBe(404);
  });
});
