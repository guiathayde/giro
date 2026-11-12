import { Api } from 'grammy';
import { describe, expect, it } from 'vitest';
import { ManualChannel } from '../../src/modules/messaging/manual-channel';
import { TelegramChannel } from '../../src/modules/messaging/telegram-channel';

function criarApi() {
  const chamadas: { metodo: string; payload: Record<string, unknown> }[] = [];
  const api = new Api('123:fake');
  api.config.use((_prev, metodo, payload) => {
    chamadas.push({ metodo, payload });
    return Promise.resolve({ ok: true, result: { message_id: 77 } as never });
  });
  return { api, chamadas };
}

const destino = { lojaId: 1, telegramChatId: 555, whatsapp: null };

describe('TelegramChannel', () => {
  it('envia o texto com o teclado Aceitar tudo / Ajustar', async () => {
    const { api, chamadas } = criarApi();
    const resultado = await new TelegramChannel(api).enviarSugestao({
      sugestaoId: 9,
      texto: 'Bom dia!',
      destino,
    });
    expect(resultado).toEqual({ telegramMessageId: 77 });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]?.metodo).toBe('sendMessage');
    expect(chamadas[0]?.payload).toMatchObject({
      chat_id: 555,
      text: 'Bom dia!',
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Aceitar tudo', callback_data: 'a:9' },
            { text: 'Ajustar', callback_data: 'j:9' },
          ],
        ],
      },
    });
  });

  it('falha sem chat vinculado e não chama o Telegram', async () => {
    const { api, chamadas } = criarApi();
    await expect(
      new TelegramChannel(api).enviarSugestao({
        sugestaoId: 9,
        texto: 'x',
        destino: { ...destino, telegramChatId: null },
      }),
    ).rejects.toThrow();
    expect(chamadas).toHaveLength(0);
  });
});

describe('ManualChannel', () => {
  it('não envia nada e devolve telegramMessageId null', async () => {
    await expect(
      new ManualChannel().enviarSugestao({ sugestaoId: 1, texto: 'x', destino }),
    ).resolves.toEqual({ telegramMessageId: null });
  });
});
