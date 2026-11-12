import { itemSchema, lojaSchema, type Item, type Loja } from '@giro/shared';
import { describe, expect, it, vi } from 'vitest';
import { criarServidor } from '../../src/app';
import { ErroHttp } from '../../src/erros';
import { limparAliases, normalizarWhatsapp } from '../../src/modules/stores/service';

const loja: Loja = {
  id: 1,
  nome: 'Bom Preço',
  nomeDono: 'Antônio',
  whatsapp: '5516991234567',
  canal: 'manual',
  telegramVinculado: false,
  envioAutomatico: false,
  sistemaPdv: null,
  fusoHorario: 'America/Sao_Paulo',
  mapeamentoColunas: null,
};

const item: Item = {
  id: 3,
  lojaId: 1,
  nome: 'Tomate',
  unidade: 'kg',
  vidaUtilDias: 5,
  custoMedio: null,
  precoMedio: null,
  multiploPedido: null,
  ativo: true,
  aliases: [],
};

function criarApp() {
  const lojas = {
    listar: vi.fn(),
    itens: vi.fn(),
    salvarMapeamentoColunas: vi.fn(),
    linkTelegram: vi.fn(),
    criar: vi.fn((dados: { nome: string }) => Promise.resolve({ ...loja, nome: dados.nome })),
    editar: vi.fn((id: number) =>
      id === 1 ? Promise.resolve(loja) : Promise.reject(new ErroHttp(404, 'Loja não encontrada')),
    ),
    criarItem: vi.fn((id: number) =>
      id === 1 ? Promise.resolve(item) : Promise.reject(new ErroHttp(404, 'Loja não encontrada')),
    ),
    editarItem: vi.fn((id: number) =>
      id === 3 ? Promise.resolve(item) : Promise.reject(new ErroHttp(404, 'Item não encontrado')),
    ),
  };
  const app = criarServidor({
    verificarBanco: async () => {},
    statusBot: () => 'desativado',
    servicos: { lojas },
  });
  return { app, lojas };
}

describe('POST /stores', () => {
  it('cria com 201 aplicando os padrões', async () => {
    const { app, lojas } = criarApp();
    const res = await app.inject({
      method: 'POST',
      url: '/stores',
      payload: { nome: ' Bom Preço ', nomeDono: 'Antônio' },
    });
    expect(res.statusCode).toBe(201);
    expect(lojaSchema.parse(res.json()).nome).toBe('Bom Preço');
    expect(lojas.criar).toHaveBeenCalledWith({
      nome: 'Bom Preço',
      nomeDono: 'Antônio',
      whatsapp: null,
      canal: 'manual',
      sistemaPdv: null,
      fusoHorario: 'America/Sao_Paulo',
    });
  });

  it('400 para dados inválidos', async () => {
    const { app } = criarApp();
    for (const payload of [
      {},
      { nome: 'A', nomeDono: 'B', whatsapp: '(16) 99123-4567' },
      { nome: 'A', nomeDono: 'B', canal: 'sms' },
    ]) {
      expect((await app.inject({ method: 'POST', url: '/stores', payload })).statusCode).toBe(400);
    }
  });
});

describe('PATCH /stores/:id', () => {
  it('edita e valida a resposta', async () => {
    const { app, lojas } = criarApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/stores/1',
      payload: { envioAutomatico: true },
    });
    expect(res.statusCode).toBe(200);
    expect(lojaSchema.parse(res.json()).id).toBe(1);
    expect(lojas.editar).toHaveBeenCalledWith(1, { envioAutomatico: true });
  });

  it('404 e 400', async () => {
    const { app } = criarApp();
    const patch = (url: string, payload: unknown) =>
      app.inject({ method: 'PATCH', url, payload: payload as object });
    expect((await patch('/stores/9', { nome: 'X' })).statusCode).toBe(404);
    expect((await patch('/stores/1', { envioAutomatico: 'sim' })).statusCode).toBe(400);
    expect((await patch('/stores/zero', {})).statusCode).toBe(400);
  });
});

describe('itens', () => {
  const novo = { nome: 'Tomate', unidade: 'kg', vidaUtilDias: 5 };

  it('POST /stores/:id/items cria com 201', async () => {
    const { app, lojas } = criarApp();
    const res = await app.inject({ method: 'POST', url: '/stores/1/items', payload: novo });
    expect(res.statusCode).toBe(201);
    expect(itemSchema.parse(res.json()).nome).toBe('Tomate');
    expect(lojas.criarItem).toHaveBeenCalledWith(1, {
      ...novo,
      custoMedio: null,
      precoMedio: null,
      multiploPedido: null,
      ativo: true,
      aliases: [],
    });
  });

  it('POST: 400, 404 e 409', async () => {
    const { app, lojas } = criarApp();
    const post = (url: string, payload: object) => app.inject({ method: 'POST', url, payload });
    expect((await post('/stores/1/items', { ...novo, unidade: 'litro' })).statusCode).toBe(400);
    expect((await post('/stores/1/items', { ...novo, vidaUtilDias: 0 })).statusCode).toBe(400);
    expect((await post('/stores/9/items', novo)).statusCode).toBe(404);

    lojas.criarItem.mockRejectedValueOnce(new ErroHttp(409, 'Já existe um item com esse nome'));
    const conflito = await post('/stores/1/items', novo);
    expect(conflito.statusCode).toBe(409);
    expect(conflito.json()).toEqual({ erro: 'Já existe um item com esse nome' });
  });

  it('PATCH /items/:id edita; 404 e 400', async () => {
    const { app, lojas } = criarApp();
    const patch = (url: string, payload: object) => app.inject({ method: 'PATCH', url, payload });
    const ok = await patch('/items/3', { aliases: ['TOMATE KG'], ativo: false });
    expect(ok.statusCode).toBe(200);
    expect(itemSchema.parse(ok.json()).id).toBe(3);
    expect(lojas.editarItem).toHaveBeenCalledWith(3, { aliases: ['TOMATE KG'], ativo: false });
    expect((await patch('/items/4', { ativo: true })).statusCode).toBe(404);
    expect((await patch('/items/3', { custoMedio: -1 })).statusCode).toBe(400);
  });
});

describe('normalizarWhatsapp', () => {
  it('guarda só dígitos e acrescenta 55 com 10 ou 11 dígitos', () => {
    expect(normalizarWhatsapp('16991234567')).toBe('5516991234567');
    expect(normalizarWhatsapp('1633334444')).toBe('551633334444');
    expect(normalizarWhatsapp('5516991234567')).toBe('5516991234567');
    expect(normalizarWhatsapp('(16) 99123-4567')).toBe('5516991234567');
    expect(normalizarWhatsapp(null)).toBeNull();
  });
});

describe('limparAliases', () => {
  it('apara, remove vazios e repetidos pela descrição normalizada', () => {
    expect(
      limparAliases(['  TOMATE KG ', '', '   ', 'Tomate', 'tomate kg', 'Tomate Italiano']),
    ).toEqual(['TOMATE KG', 'Tomate Italiano']);
  });
});
