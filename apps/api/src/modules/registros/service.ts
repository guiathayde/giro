// Perdas (descarte), faltas (ruptura) e contagens de estoque.
import {
  novaContagemSchema,
  novaFaltaSchema,
  novaPerdaSchema,
  type Contagem,
  type Falta,
  type FiltroPeriodo,
  type NovaContagem,
  type NovaFalta,
  type NovaPerda,
  type Perda,
} from '@giro/shared';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { hojeNoFuso, somarDias } from '../../datas';
import type { Db } from '../../db/client';
import { items, losses, stockCounts, stockouts, stores } from '../../db/schema';
import { naoEncontrado, requisicaoInvalida } from '../../erros';

export function criarServicoRegistros(db: Db, deps: { agora?: () => Date } = {}) {
  const agora = deps.agora ?? (() => new Date());

  async function buscarLoja(lojaId: number) {
    const [loja] = await db.select().from(stores).where(eq(stores.id, lojaId));
    if (!loja) throw naoEncontrado('Loja não encontrada');
    return loja;
  }

  async function buscarItemDaLoja(lojaId: number, itemId: number) {
    const [item] = await db
      .select()
      .from(items)
      .where(and(eq(items.id, itemId), eq(items.storeId, lojaId)));
    if (!item) throw requisicaoInvalida('Este item não é da loja');
    return item;
  }

  /** padrão: últimos 30 dias até hoje (no fuso da loja) */
  function periodo(fuso: string, filtro: FiltroPeriodo) {
    const hoje = hojeNoFuso(fuso, agora());
    return { from: filtro.from ?? somarDias(hoje, -30), to: filtro.to ?? hoje };
  }

  const montarPerda = (
    p: typeof losses.$inferSelect,
    item: { nome: string; unidade: Perda['unidade'] },
  ): Perda => ({
    id: p.id,
    lojaId: p.storeId,
    itemId: p.itemId,
    itemNome: item.nome,
    unidade: item.unidade,
    data: p.lossDate,
    quantidade: p.quantity,
    valorEstimado: p.estValue,
    motivo: p.reason,
    nota: p.note,
    criadoEm: p.createdAt.toISOString(),
  });

  const montarContagem = (
    c: typeof stockCounts.$inferSelect,
    item: { nome: string; unidade: Contagem['unidade'] },
  ): Contagem => ({
    id: c.id,
    lojaId: c.storeId,
    itemId: c.itemId,
    itemNome: item.nome,
    unidade: item.unidade,
    quantidade: c.quantity,
    contadoEm: c.countedAt.toISOString(),
    origem: c.source,
  });

  async function remover(
    tabela: typeof losses | typeof stockouts | typeof stockCounts,
    id: number,
  ) {
    const apagados = await db.delete(tabela).where(eq(tabela.id, id)).returning({ id: tabela.id });
    if (apagados.length === 0) throw naoEncontrado('Registro não encontrado');
  }

  return {
    async registrarPerda(lojaId: number, dados: NovaPerda): Promise<Perda> {
      const novo = novaPerdaSchema.parse(dados);
      const loja = await buscarLoja(lojaId);
      const item = await buscarItemDaLoja(lojaId, novo.itemId);
      const [perda] = await db
        .insert(losses)
        .values({
          storeId: lojaId,
          itemId: item.id,
          lossDate: novo.data ?? hojeNoFuso(loja.timezone, agora()),
          quantity: novo.quantidade,
          estValue:
            item.avgCost === null ? null : Math.round(novo.quantidade * item.avgCost * 100) / 100,
          reason: novo.motivo,
          note: novo.nota ?? null,
        })
        .returning();
      if (!perda) throw new Error('falha ao registrar a perda');
      return montarPerda(perda, { nome: item.name, unidade: item.unit });
    },

    async listarPerdas(lojaId: number, filtro: FiltroPeriodo): Promise<Perda[]> {
      const loja = await buscarLoja(lojaId);
      const { from, to } = periodo(loja.timezone, filtro);
      const linhas = await db
        .select({ perda: losses, nome: items.name, unidade: items.unit })
        .from(losses)
        .innerJoin(items, eq(items.id, losses.itemId))
        .where(
          and(eq(losses.storeId, lojaId), gte(losses.lossDate, from), lte(losses.lossDate, to)),
        )
        .orderBy(desc(losses.lossDate), desc(losses.id));
      return linhas.map((l) => montarPerda(l.perda, { nome: l.nome, unidade: l.unidade }));
    },

    removerPerda: (id: number): Promise<void> => remover(losses, id),

    async registrarFalta(lojaId: number, dados: NovaFalta): Promise<Falta> {
      const novo = novaFaltaSchema.parse(dados);
      const loja = await buscarLoja(lojaId);
      const item = await buscarItemDaLoja(lojaId, novo.itemId);
      const [falta] = await db
        .insert(stockouts)
        .values({
          storeId: lojaId,
          itemId: item.id,
          reportedDate: novo.data ?? hojeNoFuso(loja.timezone, agora()),
          note: novo.nota ?? null,
        })
        .returning();
      if (!falta) throw new Error('falha ao registrar a falta');
      return {
        id: falta.id,
        lojaId,
        itemId: item.id,
        itemNome: item.name,
        data: falta.reportedDate,
        nota: falta.note,
      };
    },

    async listarFaltas(lojaId: number, filtro: FiltroPeriodo): Promise<Falta[]> {
      const loja = await buscarLoja(lojaId);
      const { from, to } = periodo(loja.timezone, filtro);
      const linhas = await db
        .select({ falta: stockouts, nome: items.name })
        .from(stockouts)
        .innerJoin(items, eq(items.id, stockouts.itemId))
        .where(
          and(
            eq(stockouts.storeId, lojaId),
            gte(stockouts.reportedDate, from),
            lte(stockouts.reportedDate, to),
          ),
        )
        .orderBy(desc(stockouts.reportedDate), desc(stockouts.id));
      return linhas.map(({ falta, nome }) => ({
        id: falta.id,
        lojaId: falta.storeId,
        itemId: falta.itemId,
        itemNome: nome,
        data: falta.reportedDate,
        nota: falta.note,
      }));
    },

    removerFalta: (id: number): Promise<void> => remover(stockouts, id),

    async registrarContagem(lojaId: number, dados: NovaContagem): Promise<Contagem> {
      const novo = novaContagemSchema.parse(dados);
      await buscarLoja(lojaId);
      const item = await buscarItemDaLoja(lojaId, novo.itemId);
      const [contagem] = await db
        .insert(stockCounts)
        .values({
          storeId: lojaId,
          itemId: item.id,
          countedAt: agora(),
          quantity: novo.quantidade,
          source: novo.origem,
        })
        .returning();
      if (!contagem) throw new Error('falha ao registrar a contagem');
      return montarContagem(contagem, { nome: item.name, unidade: item.unit });
    },

    async listarContagens(lojaId: number, filtro: FiltroPeriodo): Promise<Contagem[]> {
      const loja = await buscarLoja(lojaId);
      const { from, to } = periodo(loja.timezone, filtro);
      const diaNoFuso = sql<string>`((${stockCounts.countedAt} AT TIME ZONE ${loja.timezone})::date)`;
      const linhas = await db
        .select({ contagem: stockCounts, nome: items.name, unidade: items.unit })
        .from(stockCounts)
        .innerJoin(items, eq(items.id, stockCounts.itemId))
        .where(
          and(
            eq(stockCounts.storeId, lojaId),
            sql`${diaNoFuso} >= ${from}::date`,
            sql`${diaNoFuso} <= ${to}::date`,
          ),
        )
        .orderBy(desc(stockCounts.countedAt), desc(stockCounts.id));
      return linhas.map((l) => montarContagem(l.contagem, { nome: l.nome, unidade: l.unidade }));
    },

    removerContagem: (id: number): Promise<void> => remover(stockCounts, id),
  };
}

export type ServicoRegistros = ReturnType<typeof criarServicoRegistros>;
