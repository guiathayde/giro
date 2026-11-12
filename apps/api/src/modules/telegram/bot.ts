// Handlers do bot: finos, só traduzem Telegram ↔ serviços de domínio.
import { Bot } from 'grammy';
import { extensaoAceita } from '../imports/arquivo';
import { TAMANHO_MAXIMO_ARQUIVO } from '../imports/limites';
import type { DependenciasBot } from './dependencias';
import {
  MENSAGEM_ARQUIVO_GRANDE,
  MENSAGEM_BOAS_VINDAS,
  MENSAGEM_CHAT_SEM_LOJA,
  MENSAGEM_CODIGO_INVALIDO,
  MENSAGEM_FALHA_PROCESSAMENTO,
  MENSAGEM_FORMATO_INVALIDO,
  mensagemImportacao,
  mensagemJaVinculado,
  mensagemVinculado,
} from './mensagens';

export function criarBot(token: string, deps: DependenciasBot) {
  const bot = new Bot(token, deps.config);

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

  return bot;
}
