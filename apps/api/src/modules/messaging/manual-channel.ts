import type { EnvioSugestao, MessagingChannel, ResultadoEnvio } from './canal';

/** Fallback WhatsApp (seção 5.4): o operador copia a mensagem no painel; aqui só marca como enviada. */
export class ManualChannel implements MessagingChannel {
  readonly canal = 'manual' as const;

  enviarSugestao(_envio: EnvioSugestao): Promise<ResultadoEnvio> {
    return Promise.reject(new Error('ManualChannel.enviarSugestao: não implementado'));
  }
}
