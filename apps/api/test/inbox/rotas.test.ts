import { inboxSchema, mensagemInboxSchema, type Inbox, type MensagemInbox } from '@giro/shared';
import { describe, expect, it, vi } from 'vitest';
import { criarServidor } from '../../src/app';
import { ErroHttp } from '../../src/erros';

const mensagem: MensagemInbox = {
  id: 4,
  lojaId: 1,
  lojaNome: 'Hortifruti Boa Safra',
  chatId: 123,
  texto: 'comprei mais tomate',
  criadoEm: '2026-11-12T10:00:00.000Z',
  resolvidoEm: null,
};
const inbox: Inbox = {
  mensagens: [mensagem],
  arquivos: [
    {
      id: 1,
      lojaId: 1,
      origem: 'telegram',
      nomeArquivo: 'vendas.csv',
      inicioPeriodo: '2026-11-01',
      fimPeriodo: '2026-11-11',
      linhasTotal: 10,
      linhasMapeadas: 8,
      linhasNaoMapeadas: 2,
      status: 'done',
      erro: null,
      criadoEm: '2026-11-12T09:00:00.000Z',
    },
  ],
};

function criarApp() {
  const servico = {
    listar: vi.fn((_s: 'abertas' | 'todas') => Promise.resolve(inbox)),
    resolver: vi.fn((_id: number) =>
      Promise.resolve({ ...mensagem, resolvidoEm: '2026-11-12T11:00:00.000Z' }),
    ),
  };
  const app = criarServidor({
    verificarBanco: async () => {},
    statusBot: () => 'desativado',
    servicos: { inbox: servico },
  });
  return { app, servico };
}

describe('rotas da inbox', () => {
  it('GET /inbox usa "abertas" por padrão e respeita ?status', async () => {
    const { app, servico } = criarApp();
    const res = await app.inject({ method: 'GET', url: '/inbox' });
    expect(res.statusCode).toBe(200);
    expect(inboxSchema.parse(res.json())).toEqual(inbox);
    expect(servico.listar).toHaveBeenLastCalledWith('abertas');
    await app.inject({ method: 'GET', url: '/inbox?status=todas' });
    expect(servico.listar).toHaveBeenLastCalledWith('todas');
  });

  it('GET /inbox com status inválido devolve 400', async () => {
    const { app } = criarApp();
    const res = await app.inject({ method: 'GET', url: '/inbox?status=qualquer' });
    expect(res.statusCode).toBe(400);
  });

  it('POST /inbox/:id/resolve devolve a mensagem resolvida; 404 e 400', async () => {
    const { app, servico } = criarApp();
    const res = await app.inject({ method: 'POST', url: '/inbox/4/resolve' });
    expect(res.statusCode).toBe(200);
    expect(mensagemInboxSchema.parse(res.json()).resolvidoEm).not.toBeNull();

    servico.resolver.mockRejectedValueOnce(new ErroHttp(404, 'Mensagem não encontrada'));
    expect((await app.inject({ method: 'POST', url: '/inbox/99/resolve' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/inbox/x/resolve' })).statusCode).toBe(400);
  });
});
