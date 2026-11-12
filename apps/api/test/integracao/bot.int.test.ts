// Bot com os serviços REAIS e Postgres; só a API do Telegram é interceptada.
import { and, eq } from 'drizzle-orm';
import { Api } from 'grammy';
import type { Update, UserFromGetMe } from 'grammy/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inboxMessages, losses, purchases, stores, suggestionItems } from '../../src/db/schema';
import { criarServicoImportacoes } from '../../src/modules/imports/service';
import { criarServicoInbox } from '../../src/modules/inbox/service';
import { ManualChannel } from '../../src/modules/messaging/manual-channel';
import { TelegramChannel } from '../../src/modules/messaging/telegram-channel';
import { criarServicoRegistros } from '../../src/modules/registros/service';
import { criarServicoRespostas } from '../../src/modules/respostas/service';
import { criarServicoLojas } from '../../src/modules/stores/service';
import { criarServicoSugestoes } from '../../src/modules/suggestions/service';
import { criarBot } from '../../src/modules/telegram/bot';
import { lerCallback, montarCallback } from '../../src/modules/telegram/callbacks';
import { criarServicoSessoes } from '../../src/modules/telegram/sessoes';
import { ARQUIVO_28_DIAS_CSV, lerFixture } from '../imports/fixtures';
import { criarBancoDeTeste, semearLoja, type BancoDeTeste } from './banco';

const botInfo: UserFromGetMe = {
  id: 42,
  is_bot: true,
  first_name: 'Giro',
  username: 'giro_teste_bot',
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  can_manage_bots: false,
  supports_join_request_queries: false,
};

const CHAT = 555;
const dono = { id: CHAT, is_bot: false as const, first_name: 'Antônio' };
const chat = { id: CHAT, type: 'private' as const, first_name: 'Antônio' };

let proximoUpdate = 1;
function texto(t: string): Update {
  const comando = t.startsWith('/') ? (t.split(' ')[0] ?? t) : null;
  return {
    update_id: proximoUpdate++,
    message: {
      message_id: proximoUpdate,
      date: 1_794_000_000,
      chat,
      from: dono,
      text: t,
      ...(comando && { entities: [{ type: 'bot_command', offset: 0, length: comando.length }] }),
    },
  };
}
function clique(data: string): Update {
  return {
    update_id: proximoUpdate++,
    callback_query: {
      id: String(proximoUpdate),
      from: dono,
      chat_instance: 'c',
      data,
      message: { message_id: 100, date: 1_794_000_000, chat, text: 'mensagem' },
    },
  };
}

describe('bot com serviços reais', () => {
  let banco: BancoDeTeste;
  let lojaId: number;
  let idDoItem: (nome: string) => number;
  const chamadas: { metodo: string; payload: Record<string, unknown> }[] = [];
  const erros: unknown[] = [];
  const agora = () => new Date('2026-11-09T08:30:00Z');
  let bot: ReturnType<typeof criarBot>;
  let sugestoes: ReturnType<typeof criarServicoSugestoes>;
  let lojas: ReturnType<typeof criarServicoLojas>;

  const interceptar = (api: Api) =>
    api.config.use((_prev, metodo, payload) => {
      chamadas.push({ metodo, payload });
      return Promise.resolve({ ok: true, result: { message_id: 100 } as never });
    });
  const enviadas = () => chamadas.filter((c) => c.metodo === 'sendMessage');
  const ultimaResposta = () => {
    const texto = enviadas().at(-1)?.payload.text;
    return typeof texto === 'string' ? texto : '';
  };

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    ({ lojaId, idDoItem } = await semearLoja(banco.db));
    await criarServicoImportacoes(banco.db).importar({
      lojaId,
      origem: 'pdv_csv',
      nomeArquivo: ARQUIVO_28_DIAS_CSV,
      conteudo: lerFixture(ARQUIVO_28_DIAS_CSV),
    });
    const api = new Api('123:fake');
    interceptar(api);
    lojas = criarServicoLojas(banco.db);
    sugestoes = criarServicoSugestoes(banco.db, {
      canais: { telegram: new TelegramChannel(api), manual: new ManualChannel() },
      agora,
    });
    bot = criarBot('123:fake', {
      lojas,
      importacoes: criarServicoImportacoes(banco.db),
      respostas: criarServicoRespostas(banco.db, { agora }),
      registros: criarServicoRegistros(banco.db, { agora }),
      inbox: criarServicoInbox(banco.db),
      sessoes: criarServicoSessoes(banco.db),
      baixarArquivo: () => Promise.reject(new Error('não usado')),
      registrarErro: (err) => erros.push(err),
      config: { botInfo },
    });
    interceptar(bot.api);
  });
  afterAll(() => banco.descartar());

  it('vincula o chat pelo /start <código>', async () => {
    const { codigo } = await lojas.linkTelegram(lojaId, 'giro_teste_bot');
    await bot.handleUpdate(texto(`/start ${codigo}`));
    const [loja] = await banco.db.select().from(stores).where(eq(stores.id, lojaId));
    expect(loja).toMatchObject({ telegramChatId: CHAT, channel: 'telegram' });
    expect(ultimaResposta()).toMatch(/^Pronto, Seu Antônio!/);
  });

  it('envia a sugestão pelo TelegramChannel com os botões', async () => {
    const s = await sugestoes.gerar(lojaId, {});
    const enviada = await sugestoes.enviar(s.id);
    expect(enviada.status).toBe('sent');
    const msg = enviadas().at(-1)!;
    expect(msg.payload.chat_id).toBe(CHAT);
    expect(msg.payload.text).toBe(s.mensagem);
    const teclado = (msg.payload.reply_markup as { inline_keyboard: { callback_data: string }[][] })
      .inline_keyboard;
    expect(teclado.flat().map((b) => lerCallback(b.callback_data))).toEqual([
      { tipo: 'aceitar', sugestaoId: s.id },
      { tipo: 'ajustar', sugestaoId: s.id },
    ]);
  });

  it('Ajustar → "1 35" → motivo → ok grava a resposta e a compra', async () => {
    const s = await sugestoes.buscarPorData(lojaId, '2026-11-09');
    const primeiro = s.itens.find((i) => i.posicao === 1)!;

    await bot.handleUpdate(clique(montarCallback({ tipo: 'ajustar', sugestaoId: s.id })));
    expect(ultimaResposta()).toMatch(/^1\. /m);

    await bot.handleUpdate(texto('1 35'));
    const pergunta = enviadas().at(-1)!;
    const botoes = (
      pergunta.payload.reply_markup as { inline_keyboard: { callback_data: string }[][] }
    ).inline_keyboard.flat();
    const preco = botoes
      .map((b) => lerCallback(b.callback_data))
      .find((c) => c?.tipo === 'motivo' && c.motivo === 'price');
    expect(preco).toEqual({ tipo: 'motivo', itemSugestaoId: primeiro.id, motivo: 'price' });

    await bot.handleUpdate(clique(montarCallback(preco!)));
    await bot.handleUpdate(texto('ok'));

    const [item] = await banco.db
      .select()
      .from(suggestionItems)
      .where(eq(suggestionItems.id, primeiro.id));
    expect(item).toMatchObject({ response: 'adjusted', responseQty: 35, responseReason: 'price' });
    const [compra] = await banco.db
      .select()
      .from(purchases)
      .where(eq(purchases.suggestionItemId, primeiro.id));
    expect(compra).toMatchObject({
      quantity: 35,
      purchaseDate: '2026-11-09',
      source: 'owner_reply',
    });

    const final = await sugestoes.buscarPorData(lojaId, '2026-11-09');
    expect(final.status).toBe('answered');
    expect(final.itens.filter((i) => i.resposta === null)).toHaveLength(0);
    expect(erros).toEqual([]);
  });

  it('/perda mamão 2 registra o descarte de hoje', async () => {
    await bot.handleUpdate(texto('/perda mamão 2'));
    const linhas = await banco.db
      .select()
      .from(losses)
      .where(and(eq(losses.storeId, lojaId), eq(losses.itemId, idDoItem('Mamão formosa'))));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ quantity: 2, lossDate: '2026-11-09' });
    expect(ultimaResposta()).toMatch(/Mamão formosa/);
  });

  it('texto livre vai para a inbox do operador', async () => {
    await bot.handleUpdate(texto('quanto ta o tomate no ceasa?'));
    const inbox = await banco.db.select().from(inboxMessages);
    expect(inbox).toMatchObject([
      { storeId: lojaId, telegramChatId: CHAT, text: 'quanto ta o tomate no ceasa?' },
    ]);
    expect(erros).toEqual([]);
  });
});
