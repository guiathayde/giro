// Monta a entrada do motor a partir do banco (o motor em si é puro e não conhece o banco).
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { Executor } from '../../db/client';
import {
  calendarEvents,
  items,
  purchases,
  salesDaily,
  stockCounts,
  stockouts,
  type stores,
} from '../../db/schema';
import { somarDias } from '../../datas';
import { estimarEstoque, type EntradaMotor, type VendaDia } from './engine';

export const JANELA_DIAS = 28;
export const HORIZONTE_EVENTOS_DIAS = 2;

export interface EntradaComNomes {
  entrada: EntradaMotor;
  /** nome e unidade por item, para montar a mensagem */
  nomes: Map<number, { nome: string; unidade: EntradaMotor['itens'][number]['unidade'] }>;
}

function agrupar<T extends { itemId: number }>(linhas: T[]): Map<number, T[]> {
  const mapa = new Map<number, T[]>();
  for (const linha of linhas) {
    const lista = mapa.get(linha.itemId);
    if (lista) lista.push(linha);
    else mapa.set(linha.itemId, [linha]);
  }
  return mapa;
}

export async function montarEntradaMotor(
  executor: Executor,
  loja: typeof stores.$inferSelect,
  data: string,
): Promise<EntradaComNomes> {
  const inicioJanela = somarDias(data, -JANELA_DIAS);
  const fimJanela = somarDias(data, -1);

  const itensAtivos = await executor
    .select()
    .from(items)
    .where(and(eq(items.storeId, loja.id), eq(items.active, true)))
    .orderBy(asc(items.id));
  const idsItens = itensAtivos.map((i) => i.id);

  // dia sem arquivo não tem linha nenhuma em sales_daily
  const diasComDadosLinhas = await executor
    .selectDistinct({ dia: salesDaily.saleDate })
    .from(salesDaily)
    .where(
      and(
        eq(salesDaily.storeId, loja.id),
        gte(salesDaily.saleDate, inicioJanela),
        lte(salesDaily.saleDate, fimJanela),
      ),
    )
    .orderBy(asc(salesDaily.saleDate));

  // última contagem de cada item com dia (no fuso da loja) <= data
  const diaDaContagem = sql<string>`to_char(${stockCounts.countedAt} AT TIME ZONE ${loja.timezone}, 'YYYY-MM-DD')`;
  const contagens =
    idsItens.length === 0
      ? []
      : await executor
          .selectDistinctOn([stockCounts.itemId], {
            itemId: stockCounts.itemId,
            quantidade: stockCounts.quantity,
            dia: diaDaContagem,
          })
          .from(stockCounts)
          .where(
            and(
              eq(stockCounts.storeId, loja.id),
              inArray(stockCounts.itemId, idsItens),
              sql`${diaDaContagem} <= ${data}`,
            ),
          )
          .orderBy(stockCounts.itemId, desc(stockCounts.countedAt));
  const contagemDoItem = new Map(contagens.map((c) => [c.itemId, c]));

  // vendas e compras desde a contagem mais antiga que importa (ou desde a janela)
  const desde = contagens.reduce((menor, c) => (c.dia < menor ? c.dia : menor), inicioJanela);
  const vendasLinhas =
    idsItens.length === 0
      ? []
      : await executor
          .select({
            itemId: salesDaily.itemId,
            data: salesDaily.saleDate,
            quantidade: salesDaily.quantity,
          })
          .from(salesDaily)
          .where(
            and(
              eq(salesDaily.storeId, loja.id),
              inArray(salesDaily.itemId, idsItens),
              gte(salesDaily.saleDate, desde),
              lte(salesDaily.saleDate, fimJanela),
            ),
          );
  const comprasLinhas =
    idsItens.length === 0
      ? []
      : await executor
          .select({
            itemId: purchases.itemId,
            data: purchases.purchaseDate,
            quantidade: purchases.quantity,
          })
          .from(purchases)
          .where(
            and(
              eq(purchases.storeId, loja.id),
              inArray(purchases.itemId, idsItens),
              gte(purchases.purchaseDate, desde),
              lte(purchases.purchaseDate, data),
            ),
          );
  const rupturas = await executor
    .selectDistinct({ itemId: stockouts.itemId })
    .from(stockouts)
    .where(
      and(
        eq(stockouts.storeId, loja.id),
        gte(stockouts.reportedDate, inicioJanela),
        lte(stockouts.reportedDate, fimJanela),
      ),
    );
  const comRuptura = new Set(rupturas.map((r) => r.itemId));

  const eventos = await executor
    .select()
    .from(calendarEvents)
    .where(
      and(
        or(eq(calendarEvents.storeId, loja.id), isNull(calendarEvents.storeId)),
        gte(calendarEvents.eventDate, data),
        lte(calendarEvents.eventDate, somarDias(data, HORIZONTE_EVENTOS_DIAS)),
      ),
    )
    .orderBy(asc(calendarEvents.eventDate), asc(calendarEvents.id));

  const vendasPorItem = agrupar(vendasLinhas);
  const comprasPorItem = agrupar(comprasLinhas);

  const entrada: EntradaMotor = {
    hoje: data,
    diasComDados: diasComDadosLinhas.map((l) => l.dia),
    eventos: eventos.map((e) => ({
      data: e.eventDate,
      descricao: e.label,
      fatorDemanda: e.demandFactor,
    })),
    itens: itensAtivos.map((item) => {
      const todasVendas: VendaDia[] = (vendasPorItem.get(item.id) ?? []).map((v) => ({
        data: v.data,
        quantidade: v.quantidade,
      }));
      const compras: VendaDia[] = (comprasPorItem.get(item.id) ?? []).map((c) => ({
        data: c.data,
        quantidade: c.quantidade,
      }));
      const contagemLinha = contagemDoItem.get(item.id);
      const contagem = contagemLinha
        ? { quantidade: contagemLinha.quantidade, data: contagemLinha.dia }
        : null;
      return {
        itemId: item.id,
        nome: item.name,
        unidade: item.unit,
        vidaUtilDias: item.shelfLifeDays,
        custoMedio: item.avgCost,
        multiploPedido: item.orderMultiple,
        vendas: todasVendas.filter((v) => v.data >= inicioJanela),
        estoque: estimarEstoque({ hoje: data, contagem, compras, vendas: todasVendas }),
        teveRuptura: comRuptura.has(item.id),
      };
    }),
  };

  return {
    entrada,
    nomes: new Map(itensAtivos.map((i) => [i.id, { nome: i.name, unidade: i.unit }])),
  };
}
