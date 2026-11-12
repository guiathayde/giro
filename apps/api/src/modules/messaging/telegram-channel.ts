import type { Api } from 'grammy';
import type { EnvioSugestao, MessagingChannel, ResultadoEnvio } from './canal';

/** Envia pelo bot com teclado inline (callbacks em modules/telegram/callbacks.ts). */
export class TelegramChannel implements MessagingChannel {
  readonly canal = 'telegram' as const;

  constructor(private readonly api: Api) {}

  enviarSugestao(_envio: EnvioSugestao): Promise<ResultadoEnvio> {
    void this.api;
    return Promise.reject(new Error('TelegramChannel.enviarSugestao: não implementado'));
  }
}
