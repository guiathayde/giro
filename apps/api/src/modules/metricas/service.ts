// Métricas do piloto (seção 1 do plano). A matemática está em agregacoes.ts (pura).
import type { FiltroPeriodo, MetricasCanais, MetricasLoja } from '@giro/shared';
import { and, asc, eq, gte, isNotNull, lte, min, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import {
  items,
  losses,
  salesDaily,
  stockouts,
  stores,
  suggestionItems,
  suggestions,
} from '../../db/schema';
import { hojeNoFuso, somarDias } from '../../datas';
import { naoEncontrado, requisicaoInvalida } from '../../erros';
import {
  calcularAdesao,
  calcularArquivos,
  calcularMotivosAjuste,
  calcularNotasAjuste,
  calcularPerdasPorItem,
  calcularPerdasSemanas,
  calcularRupturas,
  calcularTempoResposta,
  percentual,
  type SugestaoEnviada,
} from './agregacoes';

export function criarServicoMetricas(db: Db, deps: { agora?: () => Date } = {}) {
  const agora = deps.agora ?? (() => new Date());

  return {
    /** sem from/to: da primeira venda importada até hoje */
    async daLoja(lojaId: number, filtro: FiltroPeriodo): Promise<MetricasLoja> {
      const [loja] = await db.select().from(stores).where(eq(stores.id, lojaId));
      if (!loja) throw naoEncontrado('Loja não encontrada');

      const hoje = hojeNoFuso(loja.timezone, agora());
      const [primeira] = await db
        .select({ data: min(salesDaily.saleDate) })
        .from(salesDaily)
        .where(eq(salesDaily.storeId, lojaId));
      const primeiraVenda = primeira?.data ?? null;

      const inicio = filtro.from ?? primeiraVenda ?? somarDias(hoje, -27);
      const fim = filtro.to ?? hoje;
      if (inicio > fim) throw requisicaoInvalida('A data inicial vem depois da final');
      const periodo = { inicio, fim };

      const [primeiroEnvio] = await db
        .select({ data: min(suggestions.suggestionDate) })
        .from(suggestions)
        .where(and(eq(suggestions.storeId, lojaId), isNotNull(suggestions.sentAt)));
      const inicioSugestoes = primeiroEnvio?.data ?? null;

      const noPeriodo = and(
        eq(suggestions.storeId, lojaId),
        isNotNull(suggestions.sentAt),
        gte(suggestions.suggestionDate, inicio),
        lte(suggestions.suggestionDate, fim),
      );

      const enviadasLinhas = await db
        .select({
          id: suggestions.id,
          data: suggestions.suggestionDate,
          enviadoEm: suggestions.sentAt,
        })
        .from(suggestions)
        .where(noPeriodo)
        .orderBy(asc(suggestions.suggestionDate));
      const enviadas: SugestaoEnviada[] = enviadasLinhas.map((s) => ({
        id: s.id,
        data: s.data,
        enviadoEm: s.enviadoEm!,
      }));

      const itensSugestao = await db
        .select({
          sugestaoId: suggestionItems.suggestionId,
          data: suggestions.suggestionDate,
          itemNome: items.name,
          acao: suggestionItems.action,
          resposta: suggestionItems.response,
          motivo: suggestionItems.responseReason,
          nota: suggestionItems.responseNote,
          respondidoEm: suggestionItems.respondedAt,
        })
        .from(suggestionItems)
        .innerJoin(suggestions, eq(suggestions.id, suggestionItems.suggestionId))
        .innerJoin(items, eq(items.id, suggestionItems.itemId))
        .where(noPeriodo);

      const vendas = await db
        .selectDistinct({ data: salesDaily.saleDate })
        .from(salesDaily)
        .where(
          and(
            eq(salesDaily.storeId, lojaId),
            gte(salesDaily.saleDate, inicio),
            lte(salesDaily.saleDate, fim),
          ),
        );

      // perdas até o fim do período: a janela "antes" pode começar antes de `inicio`
      const perdasLinhas = (
        await db
          .select({
            itemId: losses.itemId,
            itemNome: items.name,
            unidade: items.unit,
            data: losses.lossDate,
            quantidade: losses.quantity,
            valor: losses.estValue,
          })
          .from(losses)
          .innerJoin(items, eq(items.id, losses.itemId))
          .where(and(eq(losses.storeId, lojaId), lte(losses.lossDate, fim)))
      ).map((p) => ({ ...p }));

      const rupturas = await db
        .select({ data: stockouts.reportedDate })
        .from(stockouts)
        .where(
          and(
            eq(stockouts.storeId, lojaId),
            gte(stockouts.reportedDate, inicio),
            lte(stockouts.reportedDate, fim),
          ),
        );

      return {
        loja: { id: loja.id, nome: loja.name, canal: loja.channel },
        periodo,
        inicioSugestoes,
        adesao: calcularAdesao(enviadas, itensSugestao),
        tempoResposta: calcularTempoResposta(enviadas, itensSugestao),
        arquivos: calcularArquivos(
          vendas.map((v) => v.data),
          periodo,
        ),
        perdas: {
          semanas: calcularPerdasSemanas(perdasLinhas, periodo),
          porItem: calcularPerdasPorItem(perdasLinhas, {
            primeiraVenda,
            inicioSugestoes,
            fimPeriodo: fim,
          }),
        },
        rupturas: calcularRupturas(rupturas, periodo),
        motivosAjuste: calcularMotivosAjuste(itensSugestao),
        notasAjuste: calcularNotasAjuste(itensSugestao),
      };
    },

    /** por loja, todo o histórico */
    async canais(): Promise<MetricasCanais> {
      const lojas = await db.select().from(stores).orderBy(asc(stores.name));
      const respondida = sql<boolean>`coalesce(bool_or(${suggestionItems.respondedAt} is not null), false)`;
      const dias = await db
        .select({ lojaId: suggestions.storeId, respondida })
        .from(suggestions)
        .leftJoin(suggestionItems, eq(suggestionItems.suggestionId, suggestions.id))
        .where(isNotNull(suggestions.sentAt))
        .groupBy(suggestions.storeId, suggestions.id);

      return lojas.map((l) => {
        const daLoja = dias.filter((d) => d.lojaId === l.id);
        return {
          lojaId: l.id,
          nome: l.name,
          canal: l.channel,
          telegramVinculado: l.telegramChatId !== null,
          diasComSugestaoEnviada: daLoja.length,
          percentualDiasRespondidos: percentual(
            daLoja.filter((d) => d.respondida).length,
            daLoja.length,
          ),
        };
      });
    },
  };
}

export type ServicoMetricas = ReturnType<typeof criarServicoMetricas>;
