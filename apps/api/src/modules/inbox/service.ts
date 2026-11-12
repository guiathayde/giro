// Inbox do bot: mensagens que ele não entendeu, para o operador agir.
import type { Importacao, Inbox, MensagemInbox } from '@giro/shared';
import { count, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { inboxMessages, salesImports, stores } from '../../db/schema';
import { naoEncontrado } from '../../erros';

export interface NovaMensagemInbox {
  lojaId: number | null;
  chatId: number;
  texto: string;
}

const LIMITE_MENSAGENS = 200;
const LIMITE_ARQUIVOS = 20;

type LinhaMensagem = typeof inboxMessages.$inferSelect;

const paraMensagem = (m: LinhaMensagem, lojaNome: string | null): MensagemInbox => ({
  id: m.id,
  lojaId: m.storeId,
  lojaNome,
  chatId: m.telegramChatId,
  texto: m.text,
  criadoEm: m.createdAt.toISOString(),
  resolvidoEm: m.resolvedAt?.toISOString() ?? null,
});

export function criarServicoInbox(db: Db) {
  return {
    async registrar(dados: NovaMensagemInbox): Promise<void> {
      await db.insert(inboxMessages).values({
        storeId: dados.lojaId,
        telegramChatId: dados.chatId,
        text: dados.texto,
      });
    },

    async listar(status: 'abertas' | 'todas'): Promise<Inbox> {
      const linhas = await db
        .select({ mensagem: inboxMessages, lojaNome: stores.name })
        .from(inboxMessages)
        .leftJoin(stores, eq(stores.id, inboxMessages.storeId))
        .where(status === 'abertas' ? isNull(inboxMessages.resolvedAt) : undefined)
        .orderBy(desc(inboxMessages.createdAt), desc(inboxMessages.id))
        .limit(LIMITE_MENSAGENS);

      // sem a coluna file_content (bytea): só os metadados
      const importacoes = await db
        .select({
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
        })
        .from(salesImports)
        .where(eq(salesImports.source, 'telegram'))
        .orderBy(desc(salesImports.createdAt), desc(salesImports.id))
        .limit(LIMITE_ARQUIVOS);

      const arquivos: Importacao[] = importacoes.map((i) => ({
        id: i.id,
        lojaId: i.storeId,
        origem: i.source,
        nomeArquivo: i.fileName,
        inicioPeriodo: i.periodStart,
        fimPeriodo: i.periodEnd,
        linhasTotal: i.rowsTotal,
        linhasMapeadas: i.rowsMatched,
        linhasNaoMapeadas: i.rowsUnmatched,
        status: i.status,
        erro: i.error,
        criadoEm: i.createdAt.toISOString(),
      }));

      return {
        mensagens: linhas.map((l) => paraMensagem(l.mensagem, l.lojaNome)),
        arquivos,
      };
    },

    async resolver(id: number): Promise<MensagemInbox> {
      const [existente] = await db
        .select({ id: inboxMessages.id, resolvedAt: inboxMessages.resolvedAt })
        .from(inboxMessages)
        .where(eq(inboxMessages.id, id));
      if (!existente) throw naoEncontrado('Mensagem não encontrada');
      // resolver de novo mantém o primeiro horário
      if (!existente.resolvedAt) {
        await db
          .update(inboxMessages)
          .set({ resolvedAt: new Date() })
          .where(eq(inboxMessages.id, id));
      }
      const [linha] = await db
        .select({ mensagem: inboxMessages, lojaNome: stores.name })
        .from(inboxMessages)
        .leftJoin(stores, eq(stores.id, inboxMessages.storeId))
        .where(eq(inboxMessages.id, id));
      if (!linha) throw naoEncontrado('Mensagem não encontrada');
      return paraMensagem(linha.mensagem, linha.lojaNome);
    },

    async contarAbertas(): Promise<number> {
      const [linha] = await db
        .select({ total: count() })
        .from(inboxMessages)
        .where(isNull(inboxMessages.resolvedAt));
      return linha?.total ?? 0;
    },
  };
}

export type ServicoInbox = ReturnType<typeof criarServicoInbox>;
