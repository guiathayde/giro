import { describe, expect, it } from 'vitest';
import { healthSchema } from '@giro/shared';
import { criarServidor } from '../src/app';

describe('GET /health', () => {
  it('responde 200 quando o banco está ok', async () => {
    const app = criarServidor({ verificarBanco: async () => {}, statusBot: () => 'desativado' });

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(healthSchema.parse(res.json())).toEqual({ status: 'ok', db: 'ok', bot: 'desativado' });
  });

  it('responde 503 quando o banco não responde', async () => {
    const app = criarServidor({
      verificarBanco: () => Promise.reject(new Error('connection refused')),
      statusBot: () => 'ativo',
    });

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'erro', db: 'erro', bot: 'ativo' });
  });
});
