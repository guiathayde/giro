// Canal de mensagens com o dono (seção 2 do plano). Telegram hoje; WhatsApp API pode entrar depois
// como outra implementação, sem mudar quem envia.
import type { Canal } from '@giro/shared';

export interface DestinoMensagem {
  lojaId: number;
  telegramChatId: number | null;
  /** 55 + DDD + número */
  whatsapp: string | null;
}

export interface EnvioSugestao {
  sugestaoId: number;
  texto: string;
  destino: DestinoMensagem;
}

export interface ResultadoEnvio {
  telegramMessageId: number | null;
}

export interface MessagingChannel {
  readonly canal: Canal;
  /** Telegram: envia com os botões [Aceitar tudo] [Ajustar]. Manual: não envia (o operador copia). */
  enviarSugestao(envio: EnvioSugestao): Promise<ResultadoEnvio>;
}
