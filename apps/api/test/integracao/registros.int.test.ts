import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { items, stockCounts, stores } from '../../src/db/schema';
import { criarServicoRegistros } from '../../src/modules/registros/service';
import { criarBancoDeTeste, semearLoja, type BancoDeTeste } from './banco';

describe('perdas, faltas e contagens no Postgres', () => {
  let banco: BancoDeTeste;
  let lojaId: number;
  let idDoItem: (nome: string) => number;
  // 13/11 01:30 UTC = 12/11 22:30 em São Paulo
  let agora = new Date('2026-11-13T01:30:00Z');
  let servico: ReturnType<typeof criarServicoRegistros>;

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    ({ lojaId, idDoItem } = await semearLoja(banco.db));
    servico = criarServicoRegistros(banco.db, { agora: () => agora });
  });
  afterAll(() => banco.descartar());

  describe('perdas', () => {
    it('registra com data de hoje no fuso da loja e valor estimado = quantidade × custo', async () => {
      const perda = await servico.registrarPerda(lojaId, {
        itemId: idDoItem('Tomate'),
        quantidade: 3,
      });
      expect(perda).toMatchObject({
        lojaId,
        itemNome: 'Tomate',
        unidade: 'kg',
        data: '2026-11-12',
        quantidade: 3,
        valorEstimado: 16.5,
        motivo: 'spoiled',
        nota: null,
      });
    });

    it('usa a data e o motivo informados; sem custo o valor é nulo', async () => {
      await banco.db
        .update(items)
        .set({ avgCost: null })
        .where(eq(items.id, idDoItem('Cebola')));
      const perda = await servico.registrarPerda(lojaId, {
        itemId: idDoItem('Cebola'),
        quantidade: 1.5,
        data: '2026-11-01',
        motivo: 'damaged',
        nota: 'caiu da caixa',
      });
      expect(perda).toMatchObject({
        data: '2026-11-01',
        valorEstimado: null,
        motivo: 'damaged',
        nota: 'caiu da caixa',
      });
    });

    it('404 para loja inexistente e 400 para item de outra loja ou inexistente', async () => {
      await expect(
        servico.registrarPerda(999_999, { itemId: idDoItem('Tomate'), quantidade: 1 }),
      ).rejects.toMatchObject({ status: 404 });

      const [outra] = await banco.db
        .insert(stores)
        .values({ name: 'Outra loja', ownerName: 'Dona Maria' })
        .returning();
      const [itemDeFora] = await banco.db
        .insert(items)
        .values({ storeId: outra!.id, name: 'Alface', unit: 'un', shelfLifeDays: 3 })
        .returning();
      await expect(
        servico.registrarPerda(lojaId, { itemId: itemDeFora!.id, quantidade: 1 }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        servico.registrarPerda(lojaId, { itemId: 999_999, quantidade: 1 }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('lista em ordem data desc, id desc; padrão cobre os últimos 30 dias', async () => {
      const t = idDoItem('Batata');
      const velha = await servico.registrarPerda(lojaId, {
        itemId: t,
        quantidade: 1,
        data: '2026-09-01',
      });
      const a = await servico.registrarPerda(lojaId, {
        itemId: t,
        quantidade: 1,
        data: '2026-10-20',
      });
      const b = await servico.registrarPerda(lojaId, {
        itemId: t,
        quantidade: 2,
        data: '2026-10-20',
      });

      const padrao = await servico.listarPerdas(lojaId, {});
      const ids = padrao.map((p) => p.id);
      expect(ids).not.toContain(velha.id);
      expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
      const datas = padrao.map((p) => p.data);
      expect(datas).toEqual([...datas].sort().reverse());
      // hoje (12/11) vem antes de 20/10
      expect(datas[0]).toBe('2026-11-12');
    });

    it('filtra por from e to (inclusivos)', async () => {
      const so = await servico.listarPerdas(lojaId, { from: '2026-10-20', to: '2026-10-20' });
      expect(so).toHaveLength(2);
      expect(so.every((p) => p.data === '2026-10-20')).toBe(true);

      const todas = await servico.listarPerdas(lojaId, { from: '2026-01-01' });
      expect(todas.map((p) => p.data)).toContain('2026-09-01');
      const ate = await servico.listarPerdas(lojaId, { from: '2026-01-01', to: '2026-09-30' });
      expect(ate.map((p) => p.data)).toEqual(['2026-09-01']);
    });

    it('remove; 404 quando não existe', async () => {
      const perda = await servico.registrarPerda(lojaId, {
        itemId: idDoItem('Tomate'),
        quantidade: 1,
      });
      await servico.removerPerda(perda.id);
      expect((await servico.listarPerdas(lojaId, {})).map((p) => p.id)).not.toContain(perda.id);
      await expect(servico.removerPerda(perda.id)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('faltas', () => {
    it('registra, lista com filtro e remove', async () => {
      const hoje = await servico.registrarFalta(lojaId, { itemId: idDoItem('Tomate') });
      expect(hoje).toMatchObject({ lojaId, itemNome: 'Tomate', data: '2026-11-12', nota: null });
      const antiga = await servico.registrarFalta(lojaId, {
        itemId: idDoItem('Cebola'),
        data: '2026-10-05',
        nota: 'acabou às 10h',
      });
      expect(antiga.nota).toBe('acabou às 10h');

      expect((await servico.listarFaltas(lojaId, {})).map((f) => f.id)).toEqual([hoje.id]);
      const todas = await servico.listarFaltas(lojaId, { from: '2026-10-01', to: '2026-11-12' });
      expect(todas.map((f) => f.id)).toEqual([hoje.id, antiga.id]);

      await servico.removerFalta(hoje.id);
      await expect(servico.removerFalta(hoje.id)).rejects.toMatchObject({ status: 404 });
    });

    it('recusa item que não é da loja', async () => {
      await expect(servico.registrarFalta(lojaId, { itemId: 999_999 })).rejects.toMatchObject({
        status: 400,
      });
      await expect(servico.registrarFalta(999_999, { itemId: 1 })).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('contagens', () => {
    it('registra com counted_at = agora e origem padrão "operator"', async () => {
      const c = await servico.registrarContagem(lojaId, {
        itemId: idDoItem('Tomate'),
        quantidade: 12.5,
      });
      expect(c).toMatchObject({
        lojaId,
        itemNome: 'Tomate',
        unidade: 'kg',
        quantidade: 12.5,
        origem: 'operator',
        contadoEm: agora.toISOString(),
      });
      const dono = await servico.registrarContagem(lojaId, {
        itemId: idDoItem('Tomate'),
        quantidade: 0,
        origem: 'owner',
      });
      expect(dono).toMatchObject({ quantidade: 0, origem: 'owner' });
    });

    it('filtra pelo dia de counted_at no fuso da loja', async () => {
      // 13/11 01:30 UTC já é "dia 12" em São Paulo
      const noite = await servico.listarContagens(lojaId, { from: '2026-11-12', to: '2026-11-12' });
      expect(noite).toHaveLength(2);
      expect(
        await servico.listarContagens(lojaId, { from: '2026-11-13', to: '2026-11-13' }),
      ).toEqual([]);

      // contagem de 12/11 13:00 UTC (10:00 em SP), inserida direto
      await banco.db.insert(stockCounts).values({
        storeId: lojaId,
        itemId: idDoItem('Cebola'),
        countedAt: new Date('2026-11-12T13:00:00Z'),
        quantity: 7,
        source: 'owner',
      });
      const dia = await servico.listarContagens(lojaId, { from: '2026-11-12', to: '2026-11-12' });
      expect(dia).toHaveLength(3);
      // mais novas primeiro
      expect(dia[0]?.contadoEm).toBe(agora.toISOString());
    });

    it('remove; 404 quando não existe', async () => {
      const [c] = await servico.listarContagens(lojaId, {});
      await servico.removerContagem(c!.id);
      await expect(servico.removerContagem(c!.id)).rejects.toMatchObject({ status: 404 });
    });
  });

  it('o relógio injetado vale para o padrão de datas', async () => {
    agora = new Date('2026-12-25T12:00:00Z');
    const falta = await servico.registrarFalta(lojaId, { itemId: idDoItem('Batata') });
    expect(falta.data).toBe('2026-12-25');
  });
});
