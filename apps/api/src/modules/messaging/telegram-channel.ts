import type { Api } from 'grammy';
import { montarCallback } from '../telegram/callbacks';
import type { EnvioSugestao, MessagingChannel, ResultadoEnvio } from './canal';

/** Envia pelo bot com teclado inline (callbacks em modules/telegram/callbacks.ts). */
export class TelegramChannel implements MessagingChannel {
  readonly canal = 'telegram' as const;

  constructor(private readonly api: Api) {}

  async enviarSugestao(envio: EnvioSugestao): Promise<ResultadoEnvio> {
    const chatId = envio.destino.telegramChatId;
    if (chatId === null) throw new Error('Loja sem Telegram vinculado');
    const { sugestaoId } = envio;
    const mensagem = await this.api.sendMessage(chatId, envio.texto, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Aceitar tudo',
              callback_data: montarCallback({ tipo: 'aceitar', sugestaoId }),
            },
            { text: 'Ajustar', callback_data: montarCallback({ tipo: 'ajustar', sugestaoId }) },
          ],
        ],
      },
    });
    return { telegramMessageId: mensagem.message_id };
  }
}
