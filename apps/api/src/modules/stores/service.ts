// Lojas: listagem, catálogo, mapeamento de colunas do PDV e vinculação com o Telegram.
import { randomInt } from 'node:crypto';
import type { Item, LinkTelegram, Loja, MapeamentoColunas } from '@giro/shared';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { items, stores } from '../../db/schema';
import { naoEncontrado } from '../../erros';

// sem 0/O, 1/I/L, para o dono não confundir se precisar digitar
const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const TAMANHO_CODIGO_VINCULO = 6;

export function gerarCodigoVinculo(aleatorio: (max: number) => number = randomInt): string {
  let codigo = '';
  for (let i = 0; i < TAMANHO_CODIGO_VINCULO; i++) {
    codigo += ALFABETO_CODIGO[aleatorio(ALFABETO_CODIGO.length)];
  }
  return codigo;
}

export interface LojaDoChat {
  id: number;
  nome: string;
  nomeDono: string;
}

function paraDto(loja: typeof stores.$inferSelect): Loja {
  return {
    id: loja.id,
    nome: loja.name,
    nomeDono: loja.ownerName,
    canal: loja.channel,
    telegramVinculado: loja.telegramChatId !== null,
    mapeamentoColunas: loja.columnMapping ?? null,
  };
}

export function criarServicoLojas(db: Db) {
  async function buscar(lojaId: number) {
    const [loja] = await db.select().from(stores).where(eq(stores.id, lojaId));
    if (!loja) throw naoEncontrado('Loja não encontrada');
    return loja;
  }

  return {
    async listar(): Promise<Loja[]> {
      const lojas = await db.select().from(stores).orderBy(asc(stores.name));
      return lojas.map(paraDto);
    },

    async itens(lojaId: number): Promise<Item[]> {
      await buscar(lojaId);
      const linhas = await db
        .select()
        .from(items)
        .where(eq(items.storeId, lojaId))
        .orderBy(asc(items.name));
      return linhas.map((i) => ({
        id: i.id,
        nome: i.name,
        unidade: i.unit,
        vidaUtilDias: i.shelfLifeDays,
        ativo: i.active,
        aliases: i.aliases,
      }));
    },

    async salvarMapeamentoColunas(
      lojaId: number,
      mapeamento: MapeamentoColunas | null,
    ): Promise<Loja> {
      await buscar(lojaId);
      const [loja] = await db
        .update(stores)
        .set({ columnMapping: mapeamento })
        .where(eq(stores.id, lojaId))
        .returning();
      return paraDto(loja!);
    },

    /** Gera (uma vez) o código de vinculação e devolve o link t.me/<bot>?start=<código>. */
    async linkTelegram(lojaId: number, usernameBot: string | undefined): Promise<LinkTelegram> {
      const loja = await buscar(lojaId);
      let codigo = loja.telegramLinkCode;
      for (let tentativa = 0; !codigo && tentativa < 5; tentativa++) {
        const novo = gerarCodigoVinculo();
        const [salva] = await db
          .update(stores)
          .set({ telegramLinkCode: novo })
          .where(eq(stores.id, lojaId))
          .returning({ codigo: stores.telegramLinkCode })
          .catch(() => []); // colisão com o código de outra loja: tenta de novo
        codigo = salva?.codigo ?? null;
      }
      if (!codigo) throw new Error('não consegui gerar um código de vinculação único');
      return { codigo, link: usernameBot ? `https://t.me/${usernameBot}?start=${codigo}` : null };
    },

    /** /start <código>: liga o chat à loja. Um chat pertence a uma loja só. */
    async vincularChat(codigo: string, chatId: number): Promise<LojaDoChat | null> {
      return db.transaction(async (tx) => {
        const [loja] = await tx
          .select()
          .from(stores)
          .where(eq(stores.telegramLinkCode, codigo.trim().toUpperCase()));
        if (!loja) return null;
        await tx
          .update(stores)
          .set({ telegramChatId: null })
          .where(eq(stores.telegramChatId, chatId));
        await tx
          .update(stores)
          .set({ telegramChatId: chatId, channel: 'telegram' })
          .where(eq(stores.id, loja.id));
        return { id: loja.id, nome: loja.name, nomeDono: loja.ownerName };
      });
    },

    async lojaDoChat(chatId: number): Promise<LojaDoChat | null> {
      const [loja] = await db.select().from(stores).where(eq(stores.telegramChatId, chatId));
      return loja ? { id: loja.id, nome: loja.name, nomeDono: loja.ownerName } : null;
    },
  };
}

export type ServicoLojas = ReturnType<typeof criarServicoLojas>;
