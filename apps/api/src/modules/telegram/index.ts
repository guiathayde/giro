import type { FastifyBaseLogger } from 'fastify';
import type { StatusBot } from '@giro/shared';
import { criarBaixarArquivo } from './arquivos';
import { criarBot } from './bot';
import type { ServicosBot } from './dependencias';

export interface BotTelegram {
  status: () => StatusBot;
  /** @username do bot, conhecido depois que ele conecta */
  username: () => string | undefined;
  parar: () => Promise<void>;
}

interface OpcoesBot {
  token: string | undefined;
  polling: boolean;
  log: FastifyBaseLogger;
  servicos: ServicosBot;
}

/**
 * Sobe o bot em long polling dentro do processo da API.
 * O bot é opcional: sem token, ou se o Telegram recusar (token inválido,
 * outro processo já fazendo polling com o mesmo token), só registra o erro.
 */
export function iniciarBotTelegram({ token, polling, log, servicos }: OpcoesBot): BotTelegram {
  if (!token || !polling) {
    log.warn(
      token
        ? 'TELEGRAM_POLLING=false: bot desativado'
        : 'TELEGRAM_BOT_TOKEN ausente: bot desativado',
    );
    return { status: () => 'desativado', username: () => undefined, parar: async () => {} };
  }

  let status: StatusBot = 'desativado';
  let username: string | undefined;
  const bot = criarBot(token, {
    ...servicos,
    baixarArquivo: criarBaixarArquivo(token),
    registrarErro: (err, contexto) => log.error({ err }, contexto),
  });

  bot.catch(({ error, ctx }) => {
    log.error({ err: error, updateId: ctx.update.update_id }, 'bot: erro ao tratar mensagem');
  });

  bot
    .start({
      onStart: (info) => {
        status = 'ativo';
        username = info.username;
        log.info(`bot @${info.username} em long polling`);
      },
    })
    .catch((err: unknown) => {
      status = 'erro';
      log.error({ err }, 'bot: long polling parou com erro');
    });

  return {
    status: () => status,
    username: () => username,
    parar: async () => {
      if (bot.isRunning()) await bot.stop();
    },
  };
}
