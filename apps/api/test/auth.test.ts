import { lojaSchema } from '@giro/shared';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { criarServidor } from '../src/app';

function criarApp(apiToken?: string) {
  const listar = vi.fn(() => Promise.resolve([]));
  const app = criarServidor({
    verificarBanco: async () => {},
    statusBot: () => 'desativado',
    apiToken,
    servicos: {
      lojas: {
        listar,
        itens: vi.fn(),
        salvarMapeamentoColunas: vi.fn(),
        linkTelegram: vi.fn(),
        criar: vi.fn(),
        editar: vi.fn(),
        criarItem: vi.fn(),
        editarItem: vi.fn(),
      },
    },
  });
  return { app, listar };
}

describe('API_TOKEN', () => {
  it('sem token configurado, as rotas ficam abertas', async () => {
    const { app } = criarApp();
    const res = await app.inject({ method: 'GET', url: '/stores' });
    expect(res.statusCode).toBe(200);
    expect(z.array(lojaSchema).parse(res.json())).toEqual([]);
  });

  it.each([
    ['sem header', undefined],
    ['token errado', 'Bearer outro'],
    ['sem Bearer', 'segredo-forte'],
    ['token com tamanho diferente', 'Bearer segredo-forte-mais'],
  ])('recusa %s com 401 sem chegar no handler', async (_caso, authorization) => {
    const { app, listar } = criarApp('segredo-forte');
    const res = await app.inject({
      method: 'GET',
      url: '/stores',
      headers: authorization ? { authorization } : {},
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ erro: 'Não autorizado' });
    expect(listar).not.toHaveBeenCalled();
  });

  it('aceita o token certo', async () => {
    const { app, listar } = criarApp('segredo-forte');
    const res = await app.inject({
      method: 'GET',
      url: '/stores',
      headers: { authorization: 'Bearer segredo-forte' },
    });
    expect(res.statusCode).toBe(200);
    expect(listar).toHaveBeenCalledOnce();
  });

  it('/health continua aberto (healthcheck do docker), com ou sem query', async () => {
    const { app } = criarApp('segredo-forte');
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/health?x=1' })).statusCode).toBe(200);
  });
});
