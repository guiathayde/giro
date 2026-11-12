import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { purchases, suggestionItems, suggestions } from '../../src/db/schema';
import { ErroHttp } from '../../src/erros';
import { criarServicoRespostas } from '../../src/modules/respostas/service';
import { criarBancoDeTeste, semearLoja, type BancoDeTeste } from './banco';

describe('respostas do dono no Postgres', () => {
  let banco: BancoDeTeste;
  let lojaId: number;
  let idDoItem: (nome: string) => number;
  let agora = new Date('2026-11-12T15:00:00Z');
  let servico: ReturnType<typeof criarServicoRespostas>;
  let diaSeguinte = 0;

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    ({ lojaId, idDoItem } = await semearLoja(banco.db));
    servico = criarServicoRespostas(banco.db, { agora: () => agora });
  });
  afterAll(() => banco.descartar());

  /** sugestão nova (data única) com Tomate 40 (pos 1), Cebola 20 (pos 2) e Batata (não repor) */
  async function criarSugestao(status: 'draft' | 'sent' | 'expired' | 'answered' = 'sent') {
    diaSeguinte += 1;
    const data = new Date(Date.UTC(2026, 0, diaSeguinte)).toISOString().slice(0, 10);
    const [sugestao] = await banco.db
      .insert(suggestions)
      .values({ storeId: lojaId, suggestionDate: data, status, channel: 'manual' })
      .returning();
    const itens = await banco.db
      .insert(suggestionItems)
      .values([
        {
          suggestionId: sugestao!.id,
          itemId: idDoItem('Tomate'),
          action: 'order',
          position: 1,
          suggestedQty: 40,
          forecastQty: 50,
        },
        {
          suggestionId: sugestao!.id,
          itemId: idDoItem('Cebola'),
          action: 'order',
          position: 2,
          suggestedQty: 20,
          forecastQty: 25,
        },
        {
          suggestionId: sugestao!.id,
          itemId: idDoItem('Batata'),
          action: 'skip',
          suggestedQty: 0,
          forecastQty: 5,
        },
      ])
      .returning();
    const [tomate, cebola, batata] = itens;
    return { sugestao: sugestao!, tomate: tomate!, cebola: cebola!, batata: batata! };
  }

  const compraDoItem = async (itemSugestaoId: number) => {
    const [c] = await banco.db
      .select()
      .from(purchases)
      .where(eq(purchases.suggestionItemId, itemSugestaoId));
    return c;
  };
  const statusDe = async (id: number) =>
    (await banco.db.select().from(suggestions).where(eq(suggestions.id, id)))[0]?.status;

  it('aceitar item de pedido cria a compra com custo médio e marca a sugestão como respondida', async () => {
    const { sugestao, tomate } = await criarSugestao();
    const item = await servico.registrar(tomate.id, { resposta: 'accepted' });
    expect(item).toMatchObject({ resposta: 'accepted', quantidadeResposta: null });
    expect(item.respondidoEm).toBe(agora.toISOString());

    expect(await compraDoItem(tomate.id)).toMatchObject({
      storeId: lojaId,
      itemId: idDoItem('Tomate'),
      purchaseDate: sugestao.suggestionDate,
      quantity: 40,
      unitCost: 5.5,
      source: 'owner_reply',
    });
    expect(await statusDe(sugestao.id)).toBe('answered');
  });

  it('ajustar guarda a quantidade, motivo e nota; compra é atualizada e depois apagada', async () => {
    const { tomate } = await criarSugestao();
    await servico.registrar(tomate.id, { resposta: 'accepted' });

    const ajustado = await servico.registrar(tomate.id, {
      resposta: 'adjusted',
      quantidade: 25,
      motivo: 'price',
      nota: 'tomate caro hoje',
    });
    expect(ajustado).toMatchObject({
      resposta: 'adjusted',
      quantidadeResposta: 25,
      motivoResposta: 'price',
      notaResposta: 'tomate caro hoje',
    });
    expect((await compraDoItem(tomate.id))?.quantity).toBe(25);

    const zerado = await servico.registrar(tomate.id, { resposta: 'adjusted', quantidade: 0 });
    expect(zerado.quantidadeResposta).toBe(0);
    // motivo anterior permanece quando não vem de novo
    expect(zerado.motivoResposta).toBe('price');
    expect(await compraDoItem(tomate.id)).toBeUndefined();
  });

  it('ignorar apaga a compra e limpa a quantidade', async () => {
    const { cebola } = await criarSugestao();
    await servico.registrar(cebola.id, { resposta: 'accepted' });
    expect(await compraDoItem(cebola.id)).toBeDefined();

    const item = await servico.registrar(cebola.id, { resposta: 'ignored', motivo: 'holiday' });
    expect(item).toMatchObject({
      resposta: 'ignored',
      quantidadeResposta: null,
      motivoResposta: 'holiday',
    });
    expect(await compraDoItem(cebola.id)).toBeUndefined();
  });

  it('aceitar item "não repor" não gera compra', async () => {
    const { batata } = await criarSugestao();
    const item = await servico.registrar(batata.id, { resposta: 'accepted' });
    expect(item.resposta).toBe('accepted');
    expect(await compraDoItem(batata.id)).toBeUndefined();
  });

  it('responded_at guarda a primeira resposta', async () => {
    const { tomate } = await criarSugestao();
    agora = new Date('2026-11-12T15:00:00Z');
    await servico.registrar(tomate.id, { resposta: 'accepted' });
    agora = new Date('2026-11-12T18:30:00Z');
    const item = await servico.registrar(tomate.id, { resposta: 'adjusted', quantidade: 10 });
    expect(item.respondidoEm).toBe('2026-11-12T15:00:00.000Z');
    agora = new Date('2026-11-12T15:00:00Z');
  });

  it('sugestão expirada vira respondida; rascunho e item inexistente são recusados', async () => {
    const expirada = await criarSugestao('expired');
    await servico.registrar(expirada.tomate.id, { resposta: 'accepted' });
    expect(await statusDe(expirada.sugestao.id)).toBe('answered');

    const rascunho = await criarSugestao('draft');
    const erro = await servico
      .registrar(rascunho.tomate.id, { resposta: 'accepted' })
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroHttp);
    expect(erro).toMatchObject({
      status: 400,
      message: 'Envie a sugestão antes de registrar respostas',
    });
    expect(await statusDe(rascunho.sugestao.id)).toBe('draft');
    expect(await compraDoItem(rascunho.tomate.id)).toBeUndefined();

    await expect(servico.registrar(999_999, { resposta: 'accepted' })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('aceitarTudo aceita só o que falta, mantém respostas e cria as compras', async () => {
    const { sugestao, tomate, cebola, batata } = await criarSugestao();
    await servico.registrar(tomate.id, { resposta: 'adjusted', quantidade: 15 });

    const resultado = await servico.aceitarTudo(sugestao.id);
    expect(resultado.status).toBe('answered');
    const porId = new Map(resultado.itens.map((i) => [i.id, i]));
    expect(porId.get(tomate.id)).toMatchObject({ resposta: 'adjusted', quantidadeResposta: 15 });
    expect(porId.get(cebola.id)?.resposta).toBe('accepted');
    expect(porId.get(batata.id)?.resposta).toBe('accepted');

    expect((await compraDoItem(tomate.id))?.quantity).toBe(15);
    expect((await compraDoItem(cebola.id))?.quantity).toBe(20);
    expect(await compraDoItem(batata.id)).toBeUndefined();
  });

  it('aceitarTudo recusa rascunho e sugestão inexistente', async () => {
    const { sugestao } = await criarSugestao('draft');
    await expect(servico.aceitarTudo(sugestao.id)).rejects.toMatchObject({ status: 400 });
    await expect(servico.aceitarTudo(999_999)).rejects.toMatchObject({ status: 404 });
  });

  it('ajustar aceita o resto, aplica por posição e separa posições inválidas', async () => {
    const { sugestao, tomate, cebola, batata } = await criarSugestao();
    const { aplicados, posicoesInvalidas } = await servico.ajustar(sugestao.id, [
      { posicao: 1, quantidade: 30 },
      { posicao: 2, quantidade: 0 },
      { posicao: 9, quantidade: 5 },
    ]);
    expect(posicoesInvalidas).toEqual([9]);
    expect(aplicados.map((i) => [i.id, i.resposta, i.quantidadeResposta])).toEqual([
      [tomate.id, 'adjusted', 30],
      [cebola.id, 'adjusted', 0],
    ]);
    expect(await statusDe(sugestao.id)).toBe('answered');
    expect((await compraDoItem(tomate.id))?.quantity).toBe(30);
    expect(await compraDoItem(cebola.id)).toBeUndefined();

    const [bat] = await banco.db
      .select()
      .from(suggestionItems)
      .where(eq(suggestionItems.id, batata.id));
    expect(bat?.response).toBe('accepted');
  });

  it('ajustar com lista vazia só aceita o resto; rascunho é recusado', async () => {
    const { sugestao, tomate } = await criarSugestao();
    const resultado = await servico.ajustar(sugestao.id, []);
    expect(resultado).toEqual({ aplicados: [], posicoesInvalidas: [] });
    expect((await compraDoItem(tomate.id))?.quantity).toBe(40);

    const rascunho = await criarSugestao('draft');
    await expect(servico.ajustar(rascunho.sugestao.id, [])).rejects.toMatchObject({ status: 400 });
  });

  it('definirMotivo e definirNota atualizam o item; 404 quando não existe', async () => {
    const { tomate } = await criarSugestao();
    await servico.registrar(tomate.id, { resposta: 'ignored' });
    expect((await servico.definirMotivo(tomate.id, 'weather')).motivoResposta).toBe('weather');
    const item = await servico.definirNota(tomate.id, 'choveu o dia todo');
    expect(item).toMatchObject({ motivoResposta: 'weather', notaResposta: 'choveu o dia todo' });

    await expect(servico.definirMotivo(999_999, 'other')).rejects.toMatchObject({ status: 404 });
    await expect(servico.definirNota(999_999, 'x')).rejects.toMatchObject({ status: 404 });
  });

  describe('sugestaoAtiva', () => {
    it('usa o dia no fuso da loja e só devolve sent/answered', async () => {
      // 13/11 01:00 UTC = 12/11 22:00 em São Paulo
      const relogio = new Date('2026-11-13T01:00:00Z');
      const s = criarServicoRespostas(banco.db, { agora: () => relogio });

      const inserir = (data: string, status: 'draft' | 'sent' | 'answered' | 'expired') =>
        banco.db
          .insert(suggestions)
          .values({ storeId: lojaId, suggestionDate: data, status, channel: 'manual' })
          .returning();

      expect(await s.sugestaoAtiva(lojaId)).toBeNull();

      await inserir('2026-11-13', 'sent'); // "amanhã" no fuso da loja: não vale
      expect(await s.sugestaoAtiva(lojaId)).toBeNull();

      const [hoje] = await inserir('2026-11-12', 'draft');
      expect(await s.sugestaoAtiva(lojaId)).toBeNull();

      await banco.db
        .update(suggestions)
        .set({ status: 'sent' })
        .where(eq(suggestions.id, hoje!.id));
      expect((await s.sugestaoAtiva(lojaId))?.id).toBe(hoje!.id);

      await banco.db
        .update(suggestions)
        .set({ status: 'answered' })
        .where(eq(suggestions.id, hoje!.id));
      expect((await s.sugestaoAtiva(lojaId))?.status).toBe('answered');

      await banco.db
        .update(suggestions)
        .set({ status: 'expired' })
        .where(eq(suggestions.id, hoje!.id));
      expect(await s.sugestaoAtiva(lojaId)).toBeNull();

      await expect(s.sugestaoAtiva(999_999)).rejects.toMatchObject({ status: 404 });
    });
  });
});
