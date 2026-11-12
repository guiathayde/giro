// Handlers do bot: finos, só traduzem Telegram ↔ serviços de domínio.
import { Bot, type BotConfig, type Context } from 'grammy';
import type { ResumoImportacao } from '@giro/shared';
import { extensaoAceita } from '../imports/arquivo';
import { TAMANHO_MAXIMO_ARQUIVO } from '../imports/limites';
import type { EntradaImportacao } from '../imports/service';
import type { LojaDoChat } from '../stores/service';
import type { BaixarArquivo } from './arquivos';
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

export interface DependenciasBot {
  lojas: {
    vincularChat: (codigo: string, chatId: number) => Promise<LojaDoChat | null>;
    lojaDoChat: (chatId: number) => Promise<LojaDoChat | null>;
  };
  importacoes: {
    importar: (entrada: EntradaImportacao) => Promise<ResumoImportacao>;
  };
  baixarArquivo: BaixarArquivo;
  /** erros inesperados; o dono sempre recebe uma resposta mesmo assim */
  registrarErro: (err: unknown, contexto: string) => void;
  config?: BotConfig<Context>;
}

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
