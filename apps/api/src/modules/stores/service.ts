// Lojas: listagem, catálogo, mapeamento de colunas do PDV e vinculação com o Telegram.
import { randomInt } from 'node:crypto';
import {
  novaLojaSchema,
  novoItemSchema,
  type EdicaoItem,
  type EdicaoLoja,
  type Item,
  type LinkTelegram,
  type Loja,
  type MapeamentoColunas,
  type NovaLoja,
  type NovoItem,
} from '@giro/shared';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { items, stores } from '../../db/schema';
import { ErroHttp, naoEncontrado } from '../../erros';
import { normalizarDescricao } from '../imports/normalizacao';

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

export function lojaParaDto(loja: typeof stores.$inferSelect): Loja {
  return {
    id: loja.id,
    nome: loja.name,
    nomeDono: loja.ownerName,
    whatsapp: loja.whatsappPhone,
    canal: loja.channel,
    telegramVinculado: loja.telegramChatId !== null,
    envioAutomatico: loja.autoSend,
    sistemaPdv: loja.pdvSystem,
    fusoHorario: loja.timezone,
    mapeamentoColunas: loja.columnMapping ?? null,
  };
}

export function itemParaDto(item: typeof items.$inferSelect): Item {
  return {
    id: item.id,
    lojaId: item.storeId,
    nome: item.name,
    unidade: item.unit,
    vidaUtilDias: item.shelfLifeDays,
    custoMedio: item.avgCost,
    precoMedio: item.avgPrice,
    multiploPedido: item.orderMultiple,
    ativo: item.active,
    aliases: item.aliases,
  };
}

/** só dígitos; com 10–11 dígitos (DDD + número) acrescenta o 55 do Brasil */
export function normalizarWhatsapp(whatsapp: string | null): string | null {
  if (whatsapp === null) return null;
  const digitos = whatsapp.replace(/\D/g, '');
  if (digitos === '') return null;
  return digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
}

/** trim, sem vazios, sem repetidos (comparados pela descrição normalizada do PDV) */
export function limparAliases(aliases: string[]): string[] {
  const vistos = new Set<string>();
  const resultado: string[] = [];
  for (const bruto of aliases) {
    const alias = bruto.trim();
    if (alias === '') continue;
    const chave = normalizarDescricao(alias) || alias.toUpperCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    resultado.push(alias);
  }
  return resultado;
}

function violouUnicidade(err: unknown, restricao: string): boolean {
  for (let e: unknown = err; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    const { code, constraint } = e as { code?: string; constraint?: string };
    if (code === '23505' && constraint === restricao) return true;
  }
  return false;
}

export function criarServicoLojas(db: Db) {
  async function buscarItem(itemId: number) {
    const [item] = await db.select().from(items).where(eq(items.id, itemId));
    if (!item) throw naoEncontrado('Item não encontrado');
    return item;
  }

  async function gravarItem<T>(operacao: () => Promise<T>): Promise<T> {
    try {
      return await operacao();
    } catch (err) {
      if (violouUnicidade(err, 'items_store_name_unique')) {
        throw new ErroHttp(409, 'Já existe um item com esse nome');
      }
      throw err;
    }
  }

  async function buscar(lojaId: number) {
    const [loja] = await db.select().from(stores).where(eq(stores.id, lojaId));
    if (!loja) throw naoEncontrado('Loja não encontrada');
    return loja;
  }

  return {
    async listar(): Promise<Loja[]> {
      const lojas = await db.select().from(stores).orderBy(asc(stores.name));
      return lojas.map(lojaParaDto);
    },

    async itens(lojaId: number): Promise<Item[]> {
      await buscar(lojaId);
      const linhas = await db
        .select()
        .from(items)
        .where(eq(items.storeId, lojaId))
        .orderBy(asc(items.name));
      return linhas.map(itemParaDto);
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
      return lojaParaDto(loja!);
    },

    async criar(dados: NovaLoja): Promise<Loja> {
      const parsed = novaLojaSchema.parse(dados);
      const [loja] = await db
        .insert(stores)
        .values({
          name: parsed.nome,
          ownerName: parsed.nomeDono,
          whatsappPhone: normalizarWhatsapp(parsed.whatsapp),
          channel: parsed.canal,
          pdvSystem: parsed.sistemaPdv,
          timezone: parsed.fusoHorario,
        })
        .returning();
      return lojaParaDto(loja!);
    },

    async editar(lojaId: number, dados: EdicaoLoja): Promise<Loja> {
      await buscar(lojaId);
      const mudancas: Partial<typeof stores.$inferInsert> = {};
      if (dados.nome !== undefined) mudancas.name = dados.nome;
      if (dados.nomeDono !== undefined) mudancas.ownerName = dados.nomeDono;
      if (dados.whatsapp !== undefined) mudancas.whatsappPhone = normalizarWhatsapp(dados.whatsapp);
      if (dados.canal !== undefined) mudancas.channel = dados.canal;
      if (dados.sistemaPdv !== undefined) mudancas.pdvSystem = dados.sistemaPdv;
      if (dados.fusoHorario !== undefined) mudancas.timezone = dados.fusoHorario;
      if (dados.envioAutomatico !== undefined) mudancas.autoSend = dados.envioAutomatico;
      if (Object.keys(mudancas).length === 0) return lojaParaDto(await buscar(lojaId));
      const [loja] = await db.update(stores).set(mudancas).where(eq(stores.id, lojaId)).returning();
      return lojaParaDto(loja!);
    },

    async criarItem(lojaId: number, dados: NovoItem): Promise<Item> {
      await buscar(lojaId);
      const parsed = novoItemSchema.parse(dados);
      const [item] = await gravarItem(() =>
        db
          .insert(items)
          .values({
            storeId: lojaId,
            name: parsed.nome,
            unit: parsed.unidade,
            shelfLifeDays: parsed.vidaUtilDias,
            avgCost: parsed.custoMedio,
            avgPrice: parsed.precoMedio,
            orderMultiple: parsed.multiploPedido,
            active: parsed.ativo,
            aliases: limparAliases(parsed.aliases),
          })
          .returning(),
      );
      return itemParaDto(item!);
    },

    async editarItem(itemId: number, dados: EdicaoItem): Promise<Item> {
      const atual = await buscarItem(itemId);
      const mudancas: Partial<typeof items.$inferInsert> = {};
      if (dados.nome !== undefined) mudancas.name = dados.nome;
      if (dados.unidade !== undefined) mudancas.unit = dados.unidade;
      if (dados.vidaUtilDias !== undefined) mudancas.shelfLifeDays = dados.vidaUtilDias;
      if (dados.custoMedio !== undefined) mudancas.avgCost = dados.custoMedio;
      if (dados.precoMedio !== undefined) mudancas.avgPrice = dados.precoMedio;
      if (dados.multiploPedido !== undefined) mudancas.orderMultiple = dados.multiploPedido;
      if (dados.ativo !== undefined) mudancas.active = dados.ativo;
      if (dados.aliases !== undefined) mudancas.aliases = limparAliases(dados.aliases);
      if (Object.keys(mudancas).length === 0) return itemParaDto(atual);
      const [item] = await gravarItem(() =>
        db.update(items).set(mudancas).where(eq(items.id, itemId)).returning(),
      );
      return itemParaDto(item!);
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
