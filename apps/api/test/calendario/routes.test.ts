import { eventoCalendarioSchema, type EventoCalendario, type NovoEvento } from '@giro/shared';
import { describe, expect, it, vi } from 'vitest';
import { criarServidor } from '../../src/app';
import { ErroHttp } from '../../src/erros';

const evento: EventoCalendario = {
  id: 7,
  lojaId: null,
  data: '2026-12-25',
  tipo: 'holiday',
  descricao: 'Natal',
  fatorDemanda: 1.4,
};

function criarApp() {
  const calendario = {
    listar: vi.fn((lojaId: number) =>
      lojaId === 1
        ? Promise.resolve([evento])
        : Promise.reject(new ErroHttp(404, 'Loja não encontrada')),
    ),
    criar: vi.fn((dados: NovoEvento) =>
      Promise.resolve({ ...evento, lojaId: dados.lojaId ?? null, descricao: dados.descricao }),
    ),
    remover: vi.fn((id: number) =>
      id === 7 ? Promise.resolve() : Promise.reject(new ErroHttp(404, 'Evento não encontrado')),
    ),
  };
  const app = criarServidor({
    verificarBanco: async () => {},
    statusBot: () => 'desativado',
    servicos: { calendario },
  });
  return { app, calendario };
}

describe('rotas de calendário', () => {
  it('GET lista eventos e repassa o período', async () => {
    const { app, calendario } = criarApp();
    const res = await app.inject('/stores/1/calendar-events?from=2026-12-01&to=2026-12-31');
    expect(res.statusCode).toBe(200);
    expect(eventoCalendarioSchema.array().parse(res.json())).toEqual([evento]);
    expect(calendario.listar).toHaveBeenCalledWith(1, { from: '2026-12-01', to: '2026-12-31' });
  });

  it('GET: 400 com data inválida e 404 sem loja', async () => {
    const { app } = criarApp();
    expect((await app.inject('/stores/1/calendar-events?from=x')).statusCode).toBe(400);
    expect((await app.inject('/stores/2/calendar-events')).statusCode).toBe(404);
  });

  it('POST cria com 201 e aplica os padrões do schema', async () => {
    const { app, calendario } = criarApp();
    const res = await app.inject({
      method: 'POST',
      url: '/calendar-events',
      payload: { data: '2026-12-25', tipo: 'holiday', descricao: ' Natal ' },
    });
    expect(res.statusCode).toBe(201);
    expect(eventoCalendarioSchema.parse(res.json()).descricao).toBe('Natal');
    expect(calendario.criar).toHaveBeenCalledWith({
      lojaId: null,
      data: '2026-12-25',
      tipo: 'holiday',
      descricao: 'Natal',
      fatorDemanda: 1,
    });
  });

  it('POST: 400 para corpo inválido', async () => {
    const { app, calendario } = criarApp();
    for (const payload of [
      { data: '25/12/2026', tipo: 'holiday', descricao: 'Natal' },
      { data: '2026-12-25', tipo: 'outro', descricao: 'Natal' },
      { data: '2026-12-25', tipo: 'holiday', descricao: '' },
      { data: '2026-12-25', tipo: 'holiday', descricao: 'Natal', fatorDemanda: 9 },
    ]) {
      const res = await app.inject({ method: 'POST', url: '/calendar-events', payload });
      expect(res.statusCode).toBe(400);
    }
    expect(calendario.criar).not.toHaveBeenCalled();
  });

  it('POST: 404 quando a loja não existe', async () => {
    const { app, calendario } = criarApp();
    calendario.criar.mockRejectedValueOnce(new ErroHttp(404, 'Loja não encontrada'));
    const res = await app.inject({
      method: 'POST',
      url: '/calendar-events',
      payload: { lojaId: 99, data: '2026-12-25', tipo: 'fair', descricao: 'Feira' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE devolve 204, 404 e 400', async () => {
    const { app } = criarApp();
    const ok = await app.inject({ method: 'DELETE', url: '/calendar-events/7' });
    expect(ok.statusCode).toBe(204);
    expect(ok.body).toBe('');
    expect((await app.inject({ method: 'DELETE', url: '/calendar-events/8' })).statusCode).toBe(
      404,
    );
    expect((await app.inject({ method: 'DELETE', url: '/calendar-events/x' })).statusCode).toBe(
      400,
    );
  });
});
