// Leitura de uma sugestão com os itens no formato do DTO compartilhado (usado por vários módulos).
import type { ItemSugestao, Sugestao } from '@giro/shared';
import { and, eq } from 'drizzle-orm';
import type { Executor } from '../../db/client';
import { items, suggestionItems, suggestions } from '../../db/schema';
import { naoEncontrado } from '../../erros';

const ORDEM_ACAO = { risk: 0, order: 1, skip: 2 } as const;

async function montar(
  executor: Executor,
  sugestao: typeof suggestions.$inferSelect,
): Promise<Sugestao> {
  const linhas = await executor
    .select({ si: suggestionItems, nome: items.name, unidade: items.unit })
    .from(suggestionItems)
    .innerJoin(items, eq(items.id, suggestionItems.itemId))
    .where(eq(suggestionItems.suggestionId, sugestao.id));

  const itens: ItemSugestao[] = linhas
    .map(({ si, nome, unidade }) => ({
      id: si.id,
      itemId: si.itemId,
      itemNome: nome,
      unidade,
      acao: si.action,
      posicao: si.position,
      quantidadeSugerida: si.suggestedQty,
      previsao: si.forecastQty,
      estoqueEstimado: si.estimatedStock,
      diasCobertura: si.daysOfCover,
      estimativaFraca: si.weakEstimate,
      motivo: si.reason,
      resposta: si.response,
      quantidadeResposta: si.responseQty,
      motivoResposta: si.responseReason,
      notaResposta: si.responseNote,
      respondidoEm: si.respondedAt?.toISOString() ?? null,
    }))
    .sort(
      (a, b) =>
        ORDEM_ACAO[a.acao] - ORDEM_ACAO[b.acao] ||
        (a.posicao ?? 0) - (b.posicao ?? 0) ||
        a.itemNome.localeCompare(b.itemNome, 'pt-BR'),
    );

  return {
    id: sugestao.id,
    lojaId: sugestao.storeId,
    data: sugestao.suggestionDate,
    geradaEm: sugestao.generatedAt.toISOString(),
    status: sugestao.status,
    canal: sugestao.channel,
    mensagem: sugestao.messageText,
    enviadaEm: sugestao.sentAt?.toISOString() ?? null,
    itens,
  };
}

export async function carregarSugestao(executor: Executor, sugestaoId: number): Promise<Sugestao> {
  const [sugestao] = await executor
    .select()
    .from(suggestions)
    .where(eq(suggestions.id, sugestaoId));
  if (!sugestao) throw naoEncontrado('Sugestão não encontrada');
  return montar(executor, sugestao);
}

export async function carregarSugestaoPorData(
  executor: Executor,
  lojaId: number,
  data: string,
): Promise<Sugestao | null> {
  const [sugestao] = await executor
    .select()
    .from(suggestions)
    .where(and(eq(suggestions.storeId, lojaId), eq(suggestions.suggestionDate, data)));
  return sugestao ? montar(executor, sugestao) : null;
}
