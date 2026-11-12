// Handlers do bot: finos, só traduzem Telegram ↔ serviços de domínio.
import { Bot, type Context } from 'grammy';
import { extensaoAceita } from '../imports/arquivo';
import { TAMANHO_MAXIMO_ARQUIVO } from '../imports/limites';
import { lerCallback } from './callbacks';
import type { DependenciasBot } from './dependencias';
import { aoAceitar, aoAjustar, aoEscolherMotivo, aoReceberTexto } from './fluxoPedido';
import { aoEscolherItem, aoReceberComando } from './fluxoRegistros';
import {
  MENSAGEM_ARQUIVO_GRANDE,
  MENSAGEM_BOAS_VINDAS,
  MENSAGEM_CHAT_SEM_LOJA,
  MENSAGEM_CODIGO_INVALIDO,
  MENSAGEM_ERRO_GENERICO,
  MENSAGEM_FALHA_PROCESSAMENTO,
  MENSAGEM_FORMATO_INVALIDO,
  mensagemImportacao,
  mensagemJaVinculado,
  mensagemVinculado,
} from './mensagens';

export function criarBot(token: string, deps: DependenciasBot) {
  const bot = new Bot(token, deps.config);

  /** erro inesperado nunca vira silêncio: registra e responde algo amigável ao dono */
  const seguro = async (ctx: Context, contexto: string, fluxo: () => Promise<void>) => {
    try {
      await fluxo();
    } catch (err) {
      deps.registrarErro(err, contexto);
      try {
        await ctx.reply(MENSAGEM_ERRO_GENERICO);
      } catch (erroResposta) {
        deps.registrarErro(erroResposta, `${contexto} (resposta de erro)`);
      }
    }
  };

  bot.command('start', async (ctx) => {
    const codigo = ctx.match.trim();
    if (codigo) {
      const loja = await deps.lojas.vincularChat(codigo, ctx.chat.id);
      await ctx.reply(loja ? mensagemVinculado(loja) : MENSAGEM_CODIGO_INVALIDO);
      return;
    }
    const loja = await deps.lojas.lojaDoChat(ctx.chat.id);
    await ctx.reply(loja ? mensagemJaVinculado(loja) : MENSAGEM_BOAS_VINDAS);
  });

  // arquivo exportado do PDV mandado como documento
  bot.on('message:document', async (ctx) => {
    const { document } = ctx.message;
    try {
      const loja = await deps.lojas.lojaDoChat(ctx.chat.id);
      if (!loja) {
        await ctx.reply(MENSAGEM_CHAT_SEM_LOJA);
        return;
      }
      const nomeArquivo = document.file_name ?? 'arquivo';
      if (!extensaoAceita(nomeArquivo)) {
        await ctx.reply(MENSAGEM_FORMATO_INVALIDO);
        return;
      }
      if ((document.file_size ?? 0) > TAMANHO_MAXIMO_ARQUIVO) {
        await ctx.reply(MENSAGEM_ARQUIVO_GRANDE);
        return;
      }

      const arquivo = await ctx.getFile();
      if (!arquivo.file_path) throw new Error('Telegram não devolveu o caminho do arquivo');
      const conteudo = await deps.baixarArquivo(arquivo.file_path);

      const resumo = await deps.importacoes.importar({
        lojaId: loja.id,
        origem: 'telegram',
        nomeArquivo,
        conteudo,
      });
      await ctx.reply(mensagemImportacao(resumo));
    } catch (err) {
      deps.registrarErro(err, 'bot: falha ao importar documento');
      await ctx.reply(MENSAGEM_FALHA_PROCESSAMENTO);
    }
  });

  for (const acao of ['perda', 'falta', 'estoque'] as const) {
    bot.command(acao, (ctx) =>
      seguro(ctx, `bot: /${acao}`, () => aoReceberComando(ctx, deps, acao, ctx.match)),
    );
  }

  bot.on('callback_query:data', async (ctx) => {
    // sempre tira o "relógio" do botão, mesmo se o resto falhar
    await ctx.answerCallbackQuery().catch((err: unknown) => {
      deps.registrarErro(err, 'bot: answerCallbackQuery');
    });
    const cb = lerCallback(ctx.callbackQuery.data);
    if (!cb) return;
    await seguro(ctx, `bot: botão ${cb.tipo}`, async () => {
      switch (cb.tipo) {
        case 'aceitar':
          return aoAceitar(ctx, deps, cb);
        case 'ajustar':
          return aoAjustar(ctx, deps, cb);
        case 'motivo':
          return aoEscolherMotivo(ctx, deps, cb);
        case 'item':
          return aoEscolherItem(ctx, deps, cb.acao, cb.itemId, cb.quantidade);
      }
    });
  });

  bot.on('message:text', (ctx) =>
    seguro(ctx, 'bot: texto', () => aoReceberTexto(ctx, deps, ctx.message.text)),
  );

  return bot;
}
