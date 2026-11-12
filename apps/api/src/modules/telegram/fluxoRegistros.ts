// /perda, /falta e /estoque: registram o que o dono conta, sem regra de negócio aqui.
import type { Context } from 'grammy';
import type { Item } from '@giro/shared';
import type { AcaoItem } from './callbacks';
import { casarItens, parsearArgumentos } from './comandos';
import type { DependenciasBot } from './dependencias';
import {
  MENSAGEM_CHAT_SEM_LOJA,
  MENSAGEM_QUAL_ITEM,
  USO_ESTOQUE,
  USO_FALTA,
  USO_PERDA,
  mensagemContagemRegistrada,
  mensagemFaltaRegistrada,
  mensagemItemNaoEncontrado,
  mensagemPerdaRegistrada,
} from './mensagens';
import { tecladoItens } from './teclados';

const USO: Record<AcaoItem, string> = { perda: USO_PERDA, falta: USO_FALTA, estoque: USO_ESTOQUE };

/** perda precisa de quantidade maior que zero; estoque aceita zero; falta não usa quantidade */
function quantidadeValida(acao: AcaoItem, quantidade: number | null): boolean {
  if (acao === 'falta') return true;
  if (quantidade === null) return false;
  return acao === 'perda' ? quantidade > 0 : quantidade >= 0;
}

async function executar(
  ctx: Context,
  deps: DependenciasBot,
  lojaId: number,
  acao: AcaoItem,
  item: Item,
  quantidade: number | null,
) {
  if (acao === 'falta') {
    await deps.registros.registrarFalta(lojaId, { itemId: item.id });
    await ctx.reply(mensagemFaltaRegistrada(item));
    return;
  }
  if (quantidade === null || !quantidadeValida(acao, quantidade)) {
    await ctx.reply(USO[acao]);
    return;
  }
  if (acao === 'perda') {
    await deps.registros.registrarPerda(lojaId, { itemId: item.id, quantidade });
    await ctx.reply(mensagemPerdaRegistrada(item, quantidade));
  } else {
    await deps.registros.registrarContagem(lojaId, {
      itemId: item.id,
      quantidade,
      origem: 'owner',
    });
    await ctx.reply(mensagemContagemRegistrada(item, quantidade));
  }
}

export async function aoReceberComando(
  ctx: Context,
  deps: DependenciasBot,
  acao: AcaoItem,
  argumentos: string,
) {
  const loja = await deps.lojas.lojaDoChat(ctx.chat?.id ?? 0);
  if (!loja) {
    await ctx.reply(MENSAGEM_CHAT_SEM_LOJA);
    return;
  }

  // falta usa o texto inteiro como nome do item; os outros separam a quantidade do fim
  const { termo, quantidade } =
    acao === 'falta'
      ? { termo: argumentos.trim(), quantidade: null }
      : parsearArgumentos(argumentos);
  if (!termo || !quantidadeValida(acao, quantidade)) {
    await ctx.reply(USO[acao]);
    return;
  }

  const itens = await deps.lojas.itens(loja.id);
  const candidatos = casarItens(termo, itens);
  const [unico] = candidatos;
  if (!unico) {
    await ctx.reply(mensagemItemNaoEncontrado(termo, itens));
  } else if (candidatos.length > 1) {
    await ctx.reply(MENSAGEM_QUAL_ITEM, {
      reply_markup: tecladoItens(acao, candidatos, quantidade),
    });
  } else {
    await executar(ctx, deps, loja.id, acao, unico, quantidade);
  }
}

/** clique num botão de "Qual deles?" */
export async function aoEscolherItem(
  ctx: Context,
  deps: DependenciasBot,
  acao: AcaoItem,
  itemId: number,
  quantidade: number | null,
) {
  const loja = await deps.lojas.lojaDoChat(ctx.chat?.id ?? 0);
  if (!loja) {
    await ctx.reply(MENSAGEM_CHAT_SEM_LOJA);
    return;
  }
  const item = (await deps.lojas.itens(loja.id)).find((i) => i.id === itemId && i.ativo);
  if (!item) {
    await ctx.reply(mensagemItemNaoEncontrado('esse item', []));
    return;
  }
  try {
    await ctx.editMessageReplyMarkup();
  } catch {
    // mensagem velha
  }
  await executar(ctx, deps, loja.id, acao, item, quantidade);
}
