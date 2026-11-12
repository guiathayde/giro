// Resposta do dono à sugestão (aceitou / ajustou / ignorou) e compras que ela gera.
import type { ItemSugestao, MotivoResposta, RegistrarResposta, Sugestao } from '@giro/shared';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Db, Transacao } from '../../db/client';
import { hojeNoFuso } from '../../datas';
import { items, purchases, stores, suggestionItems, suggestions } from '../../db/schema';
import { naoEncontrado, requisicaoInvalida } from '../../erros';
import { carregarSugestao } from '../suggestions/dto';

export interface Ajuste {
  /** número do pedido na mensagem */
  posicao: number;
  quantidade: number;
}

export interface ResultadoAjuste {
  aplicados: ItemSugestao[];
  /** posições que não existem nesta sugestão */
  posicoesInvalidas: number[];
}

interface Resposta {
  resposta: 'accepted' | 'adjusted' | 'ignored';
  quantidade?: number;
  motivo?: MotivoResposta | null;
  nota?: string | null;
}

type LinhaSugestao = typeof suggestions.$inferSelect;
type LinhaItem = typeof suggestionItems.$inferSelect;

const MSG_RASCUNHO = 'Envie a sugestão antes de registrar respostas';

export function criarServicoRespostas(db: Db, deps: { agora?: () => Date } = {}) {
  const agora = deps.agora ?? (() => new Date());

  /** sugestão que recebe respostas; 404 se não existe, 400 se ainda é rascunho */
  async function sugestaoRespondivel(tx: Transacao, sugestaoId: number): Promise<LinhaSugestao> {
    const [sugestao] = await tx.select().from(suggestions).where(eq(suggestions.id, sugestaoId));
    if (!sugestao) throw naoEncontrado('Sugestão não encontrada');
    if (sugestao.status === 'draft') throw requisicaoInvalida(MSG_RASCUNHO);
    return sugestao;
  }

  async function marcarRespondida(tx: Transacao, sugestao: LinhaSugestao) {
    if (sugestao.status === 'sent' || sugestao.status === 'expired') {
      await tx
        .update(suggestions)
        .set({ status: 'answered' })
        .where(eq(suggestions.id, sugestao.id));
    }
  }

  /** grava a resposta no item e sincroniza a compra gerada por ela */
  async function aplicar(tx: Transacao, sugestao: LinhaSugestao, item: LinhaItem, dados: Resposta) {
    const campos: Partial<typeof suggestionItems.$inferInsert> = {
      response: dados.resposta,
      responseQty: dados.resposta === 'adjusted' ? (dados.quantidade ?? 0) : null,
      // guarda a PRIMEIRA resposta: a métrica de tempo de resposta depende disso
      respondedAt: item.respondedAt ?? agora(),
    };
    if (dados.motivo != null) campos.responseReason = dados.motivo;
    if (dados.nota != null) campos.responseNote = dados.nota;
    await tx.update(suggestionItems).set(campos).where(eq(suggestionItems.id, item.id));

    let quantidade = 0;
    if (dados.resposta === 'accepted') quantidade = item.action === 'order' ? item.suggestedQty : 0;
    else if (dados.resposta === 'adjusted') quantidade = dados.quantidade ?? 0;

    if (quantidade > 0) {
      const [produto] = await tx
        .select({ custo: items.avgCost })
        .from(items)
        .where(eq(items.id, item.itemId));
      const valores = {
        storeId: sugestao.storeId,
        itemId: item.itemId,
        purchaseDate: sugestao.suggestionDate,
        quantity: quantidade,
        unitCost: produto?.custo ?? null,
        source: 'owner_reply' as const,
        suggestionItemId: item.id,
      };
      await tx
        .insert(purchases)
        .values(valores)
        .onConflictDoUpdate({ target: purchases.suggestionItemId, set: valores });
    } else {
      await tx.delete(purchases).where(eq(purchases.suggestionItemId, item.id));
    }
  }

  async function itemDaSugestao(tx: Transacao, itemSugestaoId: number): Promise<ItemSugestao> {
    const [linha] = await tx
      .select({ sugestaoId: suggestionItems.suggestionId })
      .from(suggestionItems)
      .where(eq(suggestionItems.id, itemSugestaoId));
    if (!linha) throw naoEncontrado('Item da sugestão não encontrado');
    const sugestao = await carregarSugestao(tx, linha.sugestaoId);
    const item = sugestao.itens.find((i) => i.id === itemSugestaoId);
    if (!item) throw naoEncontrado('Item da sugestão não encontrado');
    return item;
  }

  async function atualizarItem(
    itemSugestaoId: number,
    campos: Partial<typeof suggestionItems.$inferInsert>,
  ): Promise<ItemSugestao> {
    return db.transaction(async (tx) => {
      const atualizados = await tx
        .update(suggestionItems)
        .set(campos)
        .where(eq(suggestionItems.id, itemSugestaoId))
        .returning({ id: suggestionItems.id });
      if (atualizados.length === 0) throw naoEncontrado('Item da sugestão não encontrado');
      return itemDaSugestao(tx, itemSugestaoId);
    });
  }

  return {
    registrar(itemSugestaoId: number, dados: RegistrarResposta): Promise<ItemSugestao> {
      return db.transaction(async (tx) => {
        const [item] = await tx
          .select()
          .from(suggestionItems)
          .where(eq(suggestionItems.id, itemSugestaoId));
        if (!item) throw naoEncontrado('Item da sugestão não encontrado');
        const sugestao = await sugestaoRespondivel(tx, item.suggestionId);
        await aplicar(tx, sugestao, item, dados);
        await marcarRespondida(tx, sugestao);
        return itemDaSugestao(tx, itemSugestaoId);
      });
    },

    aceitarTudo(sugestaoId: number): Promise<Sugestao> {
      return db.transaction(async (tx) => {
        const sugestao = await sugestaoRespondivel(tx, sugestaoId);
        const pendentes = await tx
          .select()
          .from(suggestionItems)
          .where(
            and(eq(suggestionItems.suggestionId, sugestaoId), isNull(suggestionItems.response)),
          );
        for (const item of pendentes) await aplicar(tx, sugestao, item, { resposta: 'accepted' });
        await marcarRespondida(tx, sugestao);
        return carregarSugestao(tx, sugestaoId);
      });
    },

    /** sugestão de hoje (fuso da loja) já enviada, que ainda aceita resposta; null se não houver */
    async sugestaoAtiva(lojaId: number): Promise<Sugestao | null> {
      const [loja] = await db.select().from(stores).where(eq(stores.id, lojaId));
      if (!loja) throw naoEncontrado('Loja não encontrada');
      const [sugestao] = await db
        .select()
        .from(suggestions)
        .where(
          and(
            eq(suggestions.storeId, lojaId),
            eq(suggestions.suggestionDate, hojeNoFuso(loja.timezone, agora())),
          ),
        );
      if (!sugestao || (sugestao.status !== 'sent' && sugestao.status !== 'answered')) return null;
      return carregarSugestao(db, sugestao.id);
    },

    /** aplica "N qtd"; itens ainda sem resposta ficam aceitos (seção 5.2) */
    ajustar(sugestaoId: number, ajustes: Ajuste[]): Promise<ResultadoAjuste> {
      return db.transaction(async (tx) => {
        const sugestao = await sugestaoRespondivel(tx, sugestaoId);
        const itens = await tx
          .select()
          .from(suggestionItems)
          .where(eq(suggestionItems.suggestionId, sugestaoId))
          .orderBy(asc(suggestionItems.id));
        for (const item of itens.filter((i) => i.response === null)) {
          await aplicar(tx, sugestao, item, { resposta: 'accepted' });
        }

        const idsAjustados = new Set<number>();
        const posicoesInvalidas: number[] = [];
        for (const { posicao, quantidade } of ajustes) {
          const item = itens.find((i) => i.position === posicao);
          if (!item) {
            posicoesInvalidas.push(posicao);
            continue;
          }
          await aplicar(tx, sugestao, item, { resposta: 'adjusted', quantidade });
          idsAjustados.add(item.id);
        }
        await marcarRespondida(tx, sugestao);

        const atual = await carregarSugestao(tx, sugestaoId);
        const aplicados = atual.itens.filter((i) => idsAjustados.has(i.id));
        return { aplicados, posicoesInvalidas };
      });
    },

    definirMotivo(itemSugestaoId: number, motivo: MotivoResposta): Promise<ItemSugestao> {
      return atualizarItem(itemSugestaoId, { responseReason: motivo });
    },

    definirNota(itemSugestaoId: number, nota: string): Promise<ItemSugestao> {
      return atualizarItem(itemSugestaoId, { responseNote: nota });
    },
  };
}

export type ServicoRespostas = ReturnType<typeof criarServicoRespostas>;
