// Fluxos do pedido do dia: aceitar, ajustar, motivo e texto livre. Só traduz Telegram ↔ serviços.
import type { Context } from 'grammy';
import { normalizarDescricao } from '../imports/normalizacao';
import type { LojaDoChat } from '../stores/service';
import { parseAdjustments } from './ajustes';
import type { Callback } from './callbacks';
import type { DependenciasBot, SessaoBot } from './dependencias';
import {
  MENSAGEM_AJUSTE_AJUDA,
  MENSAGEM_AJUSTE_FINALIZADO,
  MENSAGEM_BOAS_VINDAS,
  MENSAGEM_CHAT_SEM_LOJA,
  MENSAGEM_NAO_ENTENDI,
  MENSAGEM_NOTA_ANOTADA,
  MENSAGEM_PEDE_NOTA,
  MENSAGEM_PEDIDO_ACEITO,
  MENSAGEM_PEDIDO_ENCERRADO,
  MENSAGEM_PEDIDO_OUTRA_LOJA,
  MENSAGEM_SEM_PEDIDO_ABERTO,
  mensagemItemAjustado,
  mensagemLinhasNaoEntendidas,
  mensagemListaPedidos,
  mensagemModoAjuste,
  mensagemPosicoesInvalidas,
} from './mensagens';
import { tecladoMotivos } from './teclados';

const PALAVRAS_FIM = new Set(['OK', 'PRONTO', 'FIM', 'TERMINEI']);

type CallbackDe<T extends Callback['tipo']> = Extract<Callback, { tipo: T }>;

/** tira o teclado da mensagem original; falha aqui (mensagem velha) não deve parar o fluxo */
async function tirarTeclado(ctx: Context) {
  try {
    await ctx.editMessageReplyMarkup();
  } catch {
    // mensagem muito antiga ou já sem teclado
  }
}

export async function aoAceitar(ctx: Context, deps: DependenciasBot, cb: CallbackDe<'aceitar'>) {
  const chatId = ctx.chat?.id;
  const loja = chatId === undefined ? null : await deps.lojas.lojaDoChat(chatId);
  if (chatId === undefined || !loja) {
    await ctx.reply(MENSAGEM_CHAT_SEM_LOJA);
    return;
  }
  const sugestao = await deps.respostas.aceitarTudo(cb.sugestaoId);
  if (sugestao.lojaId !== loja.id) {
    await ctx.reply(MENSAGEM_PEDIDO_OUTRA_LOJA);
    return;
  }
  await tirarTeclado(ctx);
  await deps.sessoes.limpar(chatId);
  await ctx.reply(MENSAGEM_PEDIDO_ACEITO);
}

export async function aoAjustar(ctx: Context, deps: DependenciasBot, cb: CallbackDe<'ajustar'>) {
  const chatId = ctx.chat?.id;
  const loja = chatId === undefined ? null : await deps.lojas.lojaDoChat(chatId);
  if (chatId === undefined || !loja) {
    await ctx.reply(MENSAGEM_CHAT_SEM_LOJA);
    return;
  }
  const ativa = await deps.respostas.sugestaoAtiva(loja.id);
  if (!ativa || ativa.id !== cb.sugestaoId) {
    await ctx.reply(MENSAGEM_PEDIDO_ENCERRADO);
    return;
  }
  await deps.sessoes.salvar({
    chatId,
    lojaId: loja.id,
    modo: 'ajuste',
    sugestaoId: ativa.id,
    itemSugestaoId: null,
  });
  await ctx.reply(mensagemModoAjuste(ativa.itens));
}

export async function aoEscolherMotivo(
  ctx: Context,
  deps: DependenciasBot,
  cb: CallbackDe<'motivo'>,
) {
  const chatId = ctx.chat?.id;
  const loja = chatId === undefined ? null : await deps.lojas.lojaDoChat(chatId);
  if (chatId === undefined || !loja) {
    await ctx.reply(MENSAGEM_CHAT_SEM_LOJA);
    return;
  }
  const item = await deps.respostas.definirMotivo(cb.itemSugestaoId, cb.motivo);
  try {
    await ctx.editMessageText(mensagemItemAjustado(item, cb.motivo));
  } catch {
    // mensagem velha ou igual: o motivo já foi salvo
  }
  if (cb.motivo !== 'other') return;

  const sessao = await deps.sessoes.obter(chatId);
  const sugestaoId = sessao?.sugestaoId ?? (await deps.respostas.sugestaoAtiva(loja.id))?.id;
  if (sugestaoId === undefined) return;
  await deps.sessoes.salvar({
    chatId,
    lojaId: loja.id,
    modo: 'nota',
    sugestaoId,
    itemSugestaoId: cb.itemSugestaoId,
  });
  await ctx.reply(MENSAGEM_PEDE_NOTA);
}

/** texto livre (não comando): sessão em andamento, "ok"/"tudo" ou caixa de entrada do operador */
export async function aoReceberTexto(ctx: Context, deps: DependenciasBot, texto: string) {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) return;

  const loja = await deps.lojas.lojaDoChat(chatId);
  if (!loja) {
    await ctx.reply(MENSAGEM_BOAS_VINDAS);
    await deps.inbox.registrar({ lojaId: null, chatId, texto });
    return;
  }

  const sessao = await deps.sessoes.obter(chatId);
  if (sessao && sessao.lojaId === loja.id) {
    if (sessao.modo === 'nota') await aoReceberNota(ctx, deps, sessao, texto);
    else await aoReceberAjustes(ctx, deps, sessao, texto);
    return;
  }
  await aoReceberTextoSolto(ctx, deps, loja, texto);
}

async function aoReceberNota(
  ctx: Context,
  deps: DependenciasBot,
  sessao: SessaoBot,
  texto: string,
) {
  if (sessao.itemSugestaoId !== null) {
    await deps.respostas.definirNota(sessao.itemSugestaoId, texto.trim());
  }
  await deps.sessoes.salvar({ ...sessao, modo: 'ajuste', itemSugestaoId: null });
  await ctx.reply(MENSAGEM_NOTA_ANOTADA);
}

async function aoReceberAjustes(
  ctx: Context,
  deps: DependenciasBot,
  sessao: SessaoBot,
  texto: string,
) {
  if (PALAVRAS_FIM.has(normalizarDescricao(texto))) {
    await deps.respostas.ajustar(sessao.sugestaoId, []);
    await deps.sessoes.limpar(sessao.chatId);
    await ctx.reply(MENSAGEM_AJUSTE_FINALIZADO);
    return;
  }

  const { ajustes, invalidas } = parseAdjustments(texto);
  if (ajustes.length === 0) {
    await ctx.reply(MENSAGEM_AJUSTE_AJUDA);
    return;
  }

  const resultado = await deps.respostas.ajustar(sessao.sugestaoId, ajustes);
  for (const item of resultado.aplicados) {
    await ctx.reply(mensagemItemAjustado(item), { reply_markup: tecladoMotivos(item.id) });
  }
  if (resultado.posicoesInvalidas.length > 0) {
    await ctx.reply(mensagemPosicoesInvalidas(resultado.posicoesInvalidas));
  }
  if (invalidas.length > 0) await ctx.reply(mensagemLinhasNaoEntendidas(invalidas));
}

async function aoReceberTextoSolto(
  ctx: Context,
  deps: DependenciasBot,
  loja: LojaDoChat,
  texto: string,
) {
  const palavra = normalizarDescricao(texto);
  if (palavra === 'OK') {
    const ativa = await deps.respostas.sugestaoAtiva(loja.id);
    if (!ativa) {
      await ctx.reply(MENSAGEM_SEM_PEDIDO_ABERTO);
      return;
    }
    await deps.respostas.aceitarTudo(ativa.id);
    await ctx.reply(MENSAGEM_PEDIDO_ACEITO);
    return;
  }
  if (palavra === 'TUDO') {
    const ativa = await deps.respostas.sugestaoAtiva(loja.id);
    await ctx.reply(ativa ? mensagemListaPedidos(ativa.itens) : MENSAGEM_SEM_PEDIDO_ABERTO);
    return;
  }
  await ctx.reply(MENSAGEM_NAO_ENTENDI);
  await deps.inbox.registrar({ lojaId: loja.id, chatId: ctx.chat?.id ?? 0, texto });
}
