// Estado da conversa do bot (modo ajuste, esperando nota) guardado no banco (bot_sessions).
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { botSessions } from '../../db/schema';
import type { SessaoBot } from './dependencias';

export function criarServicoSessoes(db: Db) {
  return {
    async obter(chatId: number): Promise<SessaoBot | null> {
      const [s] = await db.select().from(botSessions).where(eq(botSessions.chatId, chatId));
      if (!s) return null;
      return {
        chatId: s.chatId,
        lojaId: s.storeId,
        modo: s.mode,
        sugestaoId: s.suggestionId,
        itemSugestaoId: s.suggestionItemId,
      };
    },
    async salvar(sessao: SessaoBot): Promise<void> {
      const valores = {
        storeId: sessao.lojaId,
        mode: sessao.modo,
        suggestionId: sessao.sugestaoId,
        suggestionItemId: sessao.itemSugestaoId,
        updatedAt: sql`now()`,
      };
      await db
        .insert(botSessions)
        .values({ chatId: sessao.chatId, ...valores })
        .onConflictDoUpdate({ target: botSessions.chatId, set: valores });
    },
    async limpar(chatId: number): Promise<void> {
      await db.delete(botSessions).where(eq(botSessions.chatId, chatId));
    },
  };
}

export type ServicoSessoes = ReturnType<typeof criarServicoSessoes>;
