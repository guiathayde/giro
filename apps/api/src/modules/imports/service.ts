// Importação de vendas: grava o arquivo, interpreta, casa com os itens e alimenta sales_daily.
import type {
  DetalheImportacao,
  Importacao,
  MapearImportacao,
  NaoMapeado,
  OrigemImportacao,
  ResumoImportacao,
} from '@giro/shared';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Db, Executor } from '../../db/client';
import { items, salesImportRows, salesImports, stores } from '../../db/schema';
import { naoEncontrado, requisicaoInvalida } from '../../erros';
import { lerTabela } from './arquivo';
import { agruparVendas, criarIndiceItens, type GrupoVenda } from './casamento';
import { normalizarDescricao } from './normalizacao';
import { parsearVendas, type ResultadoParse } from './parser';

export interface EntradaImportacao {
  lojaId: number;
  origem: OrigemImportacao;
  nomeArquivo: string;
  conteudo: Uint8Array;
}

// colunas de sales_imports sem o arquivo (bytea), para listagens
const colunasImportacao = {
  id: salesImports.id,
  storeId: salesImports.storeId,
  source: salesImports.source,
  fileName: salesImports.fileName,
  periodStart: salesImports.periodStart,
  periodEnd: salesImports.periodEnd,
  rowsTotal: salesImports.rowsTotal,
  rowsMatched: salesImports.rowsMatched,
  rowsUnmatched: salesImports.rowsUnmatched,
  status: salesImports.status,
  error: salesImports.error,
  createdAt: salesImports.createdAt,
};

type LinhaImportacao = {
  [K in keyof typeof colunasImportacao]: (typeof salesImports.$inferSelect)[K];
};

function paraDto(linha: LinhaImportacao): Importacao {
  return {
    id: linha.id,
    lojaId: linha.storeId,
    origem: linha.source,
    nomeArquivo: linha.fileName,
    inicioPeriodo: linha.periodStart,
    fimPeriodo: linha.periodEnd,
    linhasTotal: linha.rowsTotal,
    linhasMapeadas: linha.rowsMatched,
    linhasNaoMapeadas: linha.rowsUnmatched,
    status: linha.status,
    erro: linha.error,
    criadoEm: linha.createdAt.toISOString(),
  };
}

const TAMANHO_LOTE = 1000;

export function criarServicoImportacoes(db: Db) {
  async function buscarImportacao(executor: Executor, id: number) {
    const [linha] = await executor
      .select(colunasImportacao)
      .from(salesImports)
      .where(eq(salesImports.id, id));
    if (!linha) throw naoEncontrado('Importação não encontrada');
    return linha;
  }

  async function naoMapeados(executor: Executor, importacaoId: number): Promise<NaoMapeado[]> {
    const linhas = await executor
      .select({
        normalizada: salesImportRows.normalizedDescription,
        descricao: sql<string>`min(${salesImportRows.description})`,
        codigo: sql<string | null>`min(${salesImportRows.productCode})`,
        linhas: sql<number>`sum(${salesImportRows.lineCount})::int`,
        quantidade: sql<string>`sum(${salesImportRows.quantity})`,
      })
      .from(salesImportRows)
      .where(
        and(
          eq(salesImportRows.importId, importacaoId),
          isNull(salesImportRows.itemId),
          eq(salesImportRows.ignored, false),
        ),
      )
      .groupBy(salesImportRows.normalizedDescription)
      .orderBy(desc(sql`sum(${salesImportRows.lineCount})`));
    return linhas.map((l) => ({ ...l, quantidade: Number(l.quantidade) }));
  }

  /** sales_daily = soma por (item, dia) das linhas casadas desta importação; idempotente. */
  async function sincronizarVendasDiarias(executor: Executor, importacaoId: number) {
    await executor.execute(sql`
      INSERT INTO sales_daily (store_id, item_id, sale_date, quantity, revenue, import_id)
      SELECT store_id, item_id, sale_date, sum(quantity), sum(revenue), import_id
      FROM sales_import_rows
      WHERE import_id = ${importacaoId} AND item_id IS NOT NULL
      GROUP BY store_id, item_id, sale_date, import_id
      ON CONFLICT (store_id, item_id, sale_date) DO UPDATE
        SET quantity = excluded.quantity, revenue = excluded.revenue, import_id = excluded.import_id
        -- arquivo reenviado substitui; uma importação antiga não sobrescreve uma mais nova
        WHERE sales_daily.import_id IS NULL OR sales_daily.import_id <= excluded.import_id
    `);
  }

  async function atualizarContagens(executor: Executor, importacaoId: number) {
    const [c] = await executor
      .select({
        total: sql<number>`coalesce(sum(${salesImportRows.lineCount}), 0)::int`,
        mapeadas: sql<number>`coalesce(sum(${salesImportRows.lineCount}) filter (where ${salesImportRows.itemId} is not null), 0)::int`,
        naoMapeadas: sql<number>`coalesce(sum(${salesImportRows.lineCount}) filter (where ${salesImportRows.itemId} is null and not ${salesImportRows.ignored}), 0)::int`,
        inicio: sql<string | null>`min(${salesImportRows.saleDate})::text`,
        fim: sql<string | null>`max(${salesImportRows.saleDate})::text`,
      })
      .from(salesImportRows)
      .where(eq(salesImportRows.importId, importacaoId));
    await executor
      .update(salesImports)
      .set({
        rowsTotal: c?.total ?? 0,
        rowsMatched: c?.mapeadas ?? 0,
        rowsUnmatched: c?.naoMapeadas ?? 0,
        periodStart: c?.inicio ?? null,
        periodEnd: c?.fim ?? null,
        status: 'done',
        error: null,
      })
      .where(eq(salesImports.id, importacaoId));
  }

  async function montarResumo(
    executor: Executor,
    importacaoId: number,
    parse?: ResultadoParse,
  ): Promise<ResumoImportacao> {
    return {
      importacao: paraDto(await buscarImportacao(executor, importacaoId)),
      colunas: parse?.ok ? parse.colunas : null,
      cabecalhos: parse?.cabecalhos ?? [],
      naoMapeados: await naoMapeados(executor, importacaoId),
      descartadas: parse?.ok ? parse.descartadas : [],
    };
  }

  /** Lê o arquivo guardado e interpreta com o mapeamento de colunas atual da loja. */
  async function interpretarArquivo(importacaoId: number) {
    const [registro] = await db
      .select({
        storeId: salesImports.storeId,
        fileName: salesImports.fileName,
        fileContent: salesImports.fileContent,
      })
      .from(salesImports)
      .where(eq(salesImports.id, importacaoId));
    if (!registro) throw naoEncontrado('Importação não encontrada');
    if (!registro.fileContent) throw requisicaoInvalida('Importação sem arquivo para processar');

    const [loja] = await db
      .select({ columnMapping: stores.columnMapping, ignorados: stores.ignoredDescriptions })
      .from(stores)
      .where(eq(stores.id, registro.storeId));
    if (!loja) throw naoEncontrado('Loja não encontrada');

    let parse: ResultadoParse;
    try {
      parse = parsearVendas(
        lerTabela(new Uint8Array(registro.fileContent), registro.fileName ?? ''),
        loja.columnMapping,
      );
    } catch {
      parse = {
        ok: false,
        erro: 'Não consegui abrir o arquivo: formato inválido ou arquivo corrompido.',
        cabecalhos: [],
      };
    }
    return { lojaId: registro.storeId, ignorados: loja.ignorados, parse };
  }

  /** (Re)processa o arquivo guardado com a configuração atual da loja e do catálogo. */
  async function processar(importacaoId: number): Promise<ResumoImportacao> {
    const { lojaId, ignorados, parse } = await interpretarArquivo(importacaoId);

    if (!parse.ok) {
      const erro = parse.erro;
      await db.transaction(async (tx) => {
        await tx.delete(salesImportRows).where(eq(salesImportRows.importId, importacaoId));
        await tx
          .update(salesImports)
          .set({
            status: 'error',
            error: erro,
            rowsTotal: 0,
            rowsMatched: 0,
            rowsUnmatched: 0,
            periodStart: null,
            periodEnd: null,
          })
          .where(eq(salesImports.id, importacaoId));
      });
      return montarResumo(db, importacaoId, parse);
    }

    const catalogo = await db
      .select({ id: items.id, name: items.name, aliases: items.aliases })
      .from(items)
      .where(eq(items.storeId, lojaId));
    const grupos = agruparVendas(parse.linhas, criarIndiceItens(catalogo), new Set(ignorados));

    return db.transaction(async (tx) => {
      await tx.delete(salesImportRows).where(eq(salesImportRows.importId, importacaoId));
      for (let i = 0; i < grupos.length; i += TAMANHO_LOTE) {
        await tx
          .insert(salesImportRows)
          .values(
            grupos.slice(i, i + TAMANHO_LOTE).map((g) => linhaDoGrupo(importacaoId, lojaId, g)),
          );
      }
      await sincronizarVendasDiarias(tx, importacaoId);
      await atualizarContagens(tx, importacaoId);
      return montarResumo(tx, importacaoId, parse);
    });
  }

  return {
    async importar(entrada: EntradaImportacao): Promise<ResumoImportacao> {
      const [loja] = await db
        .select({ id: stores.id })
        .from(stores)
        .where(eq(stores.id, entrada.lojaId));
      if (!loja) throw naoEncontrado('Loja não encontrada');

      const [criada] = await db
        .insert(salesImports)
        .values({
          storeId: entrada.lojaId,
          source: entrada.origem,
          fileName: entrada.nomeArquivo,
          fileContent: Buffer.from(entrada.conteudo),
          status: 'pending',
        })
        .returning({ id: salesImports.id });
      if (!criada) throw new Error('falha ao registrar a importação');

      try {
        return await processar(criada.id);
      } catch (err) {
        await db
          .update(salesImports)
          .set({ status: 'error', error: 'Erro interno ao processar o arquivo.' })
          .where(eq(salesImports.id, criada.id));
        throw err;
      }
    },

    reprocessar: processar,

    async mapear(
      importacaoId: number,
      { mapeamentos }: MapearImportacao,
    ): Promise<ResumoImportacao> {
      const importacao = await buscarImportacao(db, importacaoId);
      const lojaId = importacao.storeId;

      return db.transaction(async (tx) => {
        const afetadas = new Set<number>([importacaoId]);

        for (const { normalizada, itemId } of mapeamentos) {
          const [exemplo] = await tx
            .select({ descricao: salesImportRows.description })
            .from(salesImportRows)
            .where(
              and(
                eq(salesImportRows.storeId, lojaId),
                eq(salesImportRows.normalizedDescription, normalizada),
              ),
            )
            .limit(1);
          if (!exemplo)
            throw requisicaoInvalida(
              `Descrição "${normalizada}" não aparece nas vendas desta loja`,
            );

          if (itemId !== null) {
            const [item] = await tx
              .select({ id: items.id, aliases: items.aliases })
              .from(items)
              .where(and(eq(items.id, itemId), eq(items.storeId, lojaId)));
            if (!item) throw requisicaoInvalida(`Item ${itemId} não pertence a esta loja`);

            // a descrição do PDV vira alias do item, para as próximas importações casarem sozinhas
            if (!item.aliases.some((a) => normalizarDescricao(a) === normalizada)) {
              await tx
                .update(items)
                .set({ aliases: sql`array_append(${items.aliases}, ${exemplo.descricao})` })
                .where(eq(items.id, itemId));
            }
            await tx
              .update(stores)
              .set({
                ignoredDescriptions: sql`array_remove(${stores.ignoredDescriptions}, ${normalizada})`,
              })
              .where(eq(stores.id, lojaId));
          } else {
            await tx
              .update(stores)
              .set({
                ignoredDescriptions: sql`array_append(array_remove(${stores.ignoredDescriptions}, ${normalizada}), ${normalizada})`,
              })
              .where(eq(stores.id, lojaId));
          }

          // aplica em todas as importações da loja que ainda têm essa descrição pendente
          const atualizadas = await tx
            .update(salesImportRows)
            .set({ itemId, ignored: itemId === null })
            .where(
              and(
                eq(salesImportRows.storeId, lojaId),
                eq(salesImportRows.normalizedDescription, normalizada),
                isNull(salesImportRows.itemId),
              ),
            )
            .returning({ importId: salesImportRows.importId });
          for (const { importId } of atualizadas) afetadas.add(importId);
        }

        for (const id of [...afetadas].sort((a, b) => a - b)) {
          await sincronizarVendasDiarias(tx, id);
          await atualizarContagens(tx, id);
        }
        return montarResumo(tx, importacaoId);
      });
    },

    async listar(lojaId: number): Promise<Importacao[]> {
      const linhas = await db
        .select(colunasImportacao)
        .from(salesImports)
        .where(eq(salesImports.storeId, lojaId))
        .orderBy(desc(salesImports.createdAt), desc(salesImports.id))
        .limit(50);
      return linhas.map(paraDto);
    },

    async detalhe(importacaoId: number): Promise<DetalheImportacao> {
      // reinterpreta o arquivo só para mostrar colunas e cabeçalhos (não grava nada)
      const { parse } = await interpretarArquivo(importacaoId);
      const resumo = await montarResumo(db, importacaoId, parse);
      const previa = await db
        .select({
          data: salesImportRows.saleDate,
          descricao: salesImportRows.description,
          quantidade: salesImportRows.quantity,
          valor: salesImportRows.revenue,
          linhas: salesImportRows.lineCount,
          itemId: salesImportRows.itemId,
          itemNome: items.name,
          ignorada: salesImportRows.ignored,
        })
        .from(salesImportRows)
        .leftJoin(items, eq(items.id, salesImportRows.itemId))
        .where(eq(salesImportRows.importId, importacaoId))
        .orderBy(desc(salesImportRows.saleDate), asc(salesImportRows.description))
        .limit(100);
      return { ...resumo, previa };
    },
  };
}

function linhaDoGrupo(importacaoId: number, lojaId: number, g: GrupoVenda) {
  return {
    importId: importacaoId,
    storeId: lojaId,
    saleDate: g.data,
    description: g.descricao,
    normalizedDescription: g.normalizada,
    productCode: g.codigo,
    quantity: g.quantidade,
    revenue: g.valor,
    lineCount: g.linhas,
    itemId: g.itemId,
    ignored: g.ignorada,
  };
}

export type ServicoImportacoes = ReturnType<typeof criarServicoImportacoes>;
