import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { botSessions, suggestions } from '../../src/db/schema';
import { criarServicoSessoes } from '../../src/modules/telegram/sessoes';
import { criarBancoDeTeste, semearLoja, type BancoDeTeste } from './banco';

describe('sessões do bot no Postgres', () => {
  let banco: BancoDeTeste;
  let lojaId: number;
  let sugestaoId: number;
  const servico = () => criarServicoSessoes(banco.db);

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    ({ lojaId } = await semearLoja(banco.db));
    const [s] = await banco.db
      .insert(suggestions)
      .values({ storeId: lojaId, suggestionDate: '2026-11-12', channel: 'telegram' })
      .returning({ id: suggestions.id });
    if (!s) throw new Error('falha ao criar sugestão');
    sugestaoId = s.id;
  });
  afterAll(() => banco.descartar());

  it('chat sem sessão devolve null', async () => {
    expect(await servico().obter(111)).toBeNull();
  });

  it('salva e lê a sessão; salvar de novo atualiza a mesma linha', async () => {
    const s = servico();
    await s.salvar({ chatId: 222, lojaId, modo: 'ajuste', sugestaoId, itemSugestaoId: null });
    expect(await s.obter(222)).toEqual({
      chatId: 222,
      lojaId,
      modo: 'ajuste',
      sugestaoId,
      itemSugestaoId: null,
    });

    const [antes] = await banco.db.select().from(botSessions);
    await new Promise((r) => setTimeout(r, 20));
    await s.salvar({ chatId: 222, lojaId, modo: 'nota', sugestaoId, itemSugestaoId: null });

    expect((await s.obter(222))?.modo).toBe('nota');
    const todas = await banco.db.select().from(botSessions);
    expect(todas).toHaveLength(1);
    expect(todas[0]?.updatedAt.getTime()).toBeGreaterThan(antes?.updatedAt.getTime() ?? 0);
  });

  it('limpar remove a sessão e não falha se ela não existe', async () => {
    const s = servico();
    await s.limpar(222);
    expect(await s.obter(222)).toBeNull();
    await expect(s.limpar(222)).resolves.toBeUndefined();
  });
});
