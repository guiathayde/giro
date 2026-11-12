import type { Item, ItemSugestao, Sugestao } from '@giro/shared';
import type { UserFromGetMe } from 'grammy/types';
import { describe, expect, it, vi } from 'vitest';
import type { LojaDoChat } from '../../src/modules/stores/service';
import { montarCallback, type Callback } from '../../src/modules/telegram/callbacks';
import { criarBot } from '../../src/modules/telegram/bot';
import type { DependenciasBot, SessaoBot } from '../../src/modules/telegram/dependencias';
import {
  MENSAGEM_BOAS_VINDAS,
  MENSAGEM_CHAT_SEM_LOJA,
  MENSAGEM_ERRO_GENERICO,
  MENSAGEM_NAO_ENTENDI,
  MENSAGEM_PEDIDO_ENCERRADO,
} from '../../src/modules/telegram/mensagens';
import { servicosNaoUsados } from './fakes';
import { itemFalso, itemSugestaoFalso, sugestaoFalsa } from './fabricas';

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
const LOJA: LojaDoChat = { id: 1, nome: 'Hortifruti Bom Preço', nomeDono: 'Seu Antônio' };

const TOMATE = itemSugestaoFalso({
  id: 11,
  itemNome: 'Tomate',
  posicao: 1,
  quantidadeSugerida: 40,
});
const MAMAO = itemSugestaoFalso({
  id: 12,
  itemNome: 'Mamão formosa',
  posicao: 2,
  quantidadeSugerida: 12,
});
const ALFACE = itemSugestaoFalso({
  id: 13,
  itemNome: 'Alface',
  unidade: 'maco',
  posicao: 3,
  quantidadeSugerida: 20,
});
const ENCALHE = itemSugestaoFalso({ id: 14, itemNome: 'Banana', acao: 'risk', posicao: null });
const SUGESTAO = sugestaoFalsa(LOJA.id, [ENCALHE, TOMATE, MAMAO, ALFACE]);

interface Opcoes {
  loja?: LojaDoChat | null;
  sessao?: SessaoBot | null;
  ativa?: Sugestao | null;
  itens?: Item[];
}

function criar(opcoes: Opcoes = {}) {
  const loja = opcoes.loja === undefined ? LOJA : opcoes.loja;
  const base = servicosNaoUsados();
  const deps = {
    ...base,
    lojas: {
      vincularChat: vi.fn(() => Promise.resolve(null)),
      lojaDoChat: vi.fn(() => Promise.resolve(loja)),
      itens: vi.fn(() => Promise.resolve(opcoes.itens ?? [])),
    },
    respostas: {
      ...base.respostas,
      sugestaoAtiva: vi.fn(() =>
        Promise.resolve(opcoes.ativa === undefined ? SUGESTAO : opcoes.ativa),
      ),
    },
    sessoes: {
      obter: vi.fn(() => Promise.resolve(opcoes.sessao ?? null)),
      salvar: vi.fn(() => Promise.resolve()),
      limpar: vi.fn(() => Promise.resolve()),
    },
    inbox: { registrar: vi.fn(() => Promise.resolve()) },
    importacoes: { importar: vi.fn() },
    baixarArquivo: vi.fn(),
    registrarErro: vi.fn(),
    config: { botInfo },
  } satisfies DependenciasBot;

  const chamadas: { metodo: string; payload: Record<string, unknown> }[] = [];
  const bot = criarBot('123:fake', deps);
  bot.api.config.use((_prev, metodo, payload) => {
    chamadas.push({ metodo, payload });
    return Promise.resolve({ ok: true, result: { message_id: 1 } as never });
  });

  const respostas = () =>
    chamadas.filter((c) => c.metodo === 'sendMessage').map((c) => c.payload.text);
  const chamadasDe = (metodo: string) => chamadas.filter((c) => c.metodo === metodo);
  return { bot, deps, chamadas, respostas, chamadasDe };
}

const chat = { id: CHAT, type: 'private' as const, first_name: 'Antônio' };
const de = { id: CHAT, is_bot: false, first_name: 'Antônio' };

const texto = (t: string) => ({
  update_id: 1,
  message: { message_id: 10, date: 1_794_000_000, chat, from: de, text: t },
});

const comando = (t: string) => ({
  update_id: 1,
  message: {
    ...texto(t).message,
    entities: [{ type: 'bot_command' as const, offset: 0, length: (t.split(' ')[0] ?? t).length }],
  },
});

const clique = (cb: Callback) => ({
  update_id: 1,
  callback_query: {
    id: 'cq1',
    chat_instance: 'x',
    from: de,
    data: montarCallback(cb),
    message: { message_id: 20, date: 1_794_000_000, chat, text: 'mensagem' },
  },
});

const botoes = (payload: Record<string, unknown>) =>
  (
    (payload.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] })
      .inline_keyboard ?? []
  ).flat();

describe('callback aceitar', () => {
  it('aceita tudo, tira o teclado, limpa a sessão e confirma', async () => {
    const { bot, deps, respostas, chamadasDe } = criar();
    deps.respostas.aceitarTudo.mockResolvedValue(SUGESTAO);

    await bot.handleUpdate(clique({ tipo: 'aceitar', sugestaoId: 7 }));

    expect(chamadasDe('answerCallbackQuery')).toHaveLength(1);
    expect(deps.respostas.aceitarTudo).toHaveBeenCalledWith(7);
    expect(chamadasDe('editMessageReplyMarkup')).toHaveLength(1);
    expect(deps.sessoes.limpar).toHaveBeenCalledWith(CHAT);
    expect(respostas()).toEqual(['Anotado! Pedido aceito.']);
  });

  it('recusa sugestão que não é a ativa desta loja, sem gravar nada', async () => {
    const { bot, deps, respostas, chamadasDe } = criar();

    await bot.handleUpdate(clique({ tipo: 'aceitar', sugestaoId: 99 }));

    expect(chamadasDe('answerCallbackQuery')).toHaveLength(1);
    expect(deps.respostas.aceitarTudo).not.toHaveBeenCalled();
    expect(chamadasDe('editMessageReplyMarkup')).toHaveLength(0);
    expect(deps.sessoes.limpar).not.toHaveBeenCalled();
    expect(respostas()).toEqual([MENSAGEM_PEDIDO_ENCERRADO]);
  });

  it('chat sem loja: responde o callback e explica', async () => {
    const { bot, deps, respostas, chamadasDe } = criar({ loja: null });
    await bot.handleUpdate(clique({ tipo: 'aceitar', sugestaoId: 7 }));
    expect(chamadasDe('answerCallbackQuery')).toHaveLength(1);
    expect(deps.respostas.aceitarTudo).not.toHaveBeenCalled();
    expect(respostas()).toEqual([MENSAGEM_CHAT_SEM_LOJA]);
  });

  it('erro do serviço: registra e responde algo amigável', async () => {
    const { bot, deps, respostas, chamadasDe } = criar();
    deps.respostas.aceitarTudo.mockRejectedValue(new Error('banco caiu'));
    await bot.handleUpdate(clique({ tipo: 'aceitar', sugestaoId: 7 }));
    expect(chamadasDe('answerCallbackQuery')).toHaveLength(1);
    expect(deps.registrarErro).toHaveBeenCalledOnce();
    expect(respostas()).toEqual([MENSAGEM_ERRO_GENERICO]);
  });

  it('callback_data desconhecido: só responde o callback', async () => {
    const { bot, chamadas, chamadasDe } = criar();
    await bot.handleUpdate({
      ...clique({ tipo: 'aceitar', sugestaoId: 7 }),
      callback_query: { ...clique({ tipo: 'aceitar', sugestaoId: 7 }).callback_query, data: 'zzz' },
    });
    expect(chamadasDe('answerCallbackQuery')).toHaveLength(1);
    expect(chamadas).toHaveLength(1);
  });
});

describe('callback ajustar', () => {
  it('salva a sessão e lista os pedidos numerados', async () => {
    const { bot, deps, respostas, chamadasDe } = criar();
    await bot.handleUpdate(clique({ tipo: 'ajustar', sugestaoId: 7 }));

    expect(chamadasDe('answerCallbackQuery')).toHaveLength(1);
    expect(deps.sessoes.salvar).toHaveBeenCalledWith({
      chatId: CHAT,
      lojaId: LOJA.id,
      modo: 'ajuste',
      sugestaoId: 7,
      itemSugestaoId: null,
    });
    expect(respostas()).toEqual([
      '1. Tomate — 40 kg\n2. Mamão formosa — 12 kg\n3. Alface — 20 maço\n\n' +
        'Mande o número e a quantidade, uma linha por item (ex.: 1 35). Os que você não mandar ficam como sugerido. Quando terminar, mande ok.',
    ]);
  });

  it('sugestão que não é a ativa: não entra em modo ajuste', async () => {
    const { bot, deps, respostas } = criar({ ativa: sugestaoFalsa(LOJA.id, [], 8) });
    await bot.handleUpdate(clique({ tipo: 'ajustar', sugestaoId: 7 }));
    expect(deps.sessoes.salvar).not.toHaveBeenCalled();
    expect(respostas()).toEqual(['Esse pedido não está mais aberto.']);
  });

  it('sem sugestão ativa', async () => {
    const { bot, deps, respostas } = criar({ ativa: null });
    await bot.handleUpdate(clique({ tipo: 'ajustar', sugestaoId: 7 }));
    expect(deps.sessoes.salvar).not.toHaveBeenCalled();
    expect(respostas()).toEqual(['Esse pedido não está mais aberto.']);
  });
});

describe('texto em modo ajuste', () => {
  const sessao: SessaoBot = {
    chatId: CHAT,
    lojaId: LOJA.id,
    modo: 'ajuste',
    sugestaoId: 7,
    itemSugestaoId: null,
  };

  it.each(['ok', 'OK', 'Pronto', 'fim', 'terminei', 'Terminei!'])(
    '"%s" aceita o resto e limpa a sessão',
    async (palavra) => {
      const { bot, deps, respostas } = criar({ sessao });
      deps.respostas.ajustar.mockResolvedValue({ aplicados: [], posicoesInvalidas: [] });
      await bot.handleUpdate(texto(palavra));
      expect(deps.respostas.ajustar).toHaveBeenCalledWith(7, []);
      expect(deps.sessoes.limpar).toHaveBeenCalledWith(CHAT);
      expect(respostas()).toEqual(['Pronto! O que você não mexeu fica como sugerido.']);
    },
  );

  it('aplica os ajustes e pergunta o motivo de cada item', async () => {
    const { bot, deps, respostas, chamadasDe } = criar({ sessao });
    const tomate: ItemSugestao = { ...TOMATE, resposta: 'adjusted', quantidadeResposta: 35 };
    const mamao: ItemSugestao = { ...MAMAO, resposta: 'adjusted', quantidadeResposta: 20.5 };
    deps.respostas.ajustar.mockResolvedValue({ aplicados: [tomate, mamao], posicoesInvalidas: [] });

    await bot.handleUpdate(texto('1 35\n2 20,5'));

    expect(deps.respostas.ajustar).toHaveBeenCalledWith(7, [
      { posicao: 1, quantidade: 35 },
      { posicao: 2, quantidade: 20.5 },
    ]);
    expect(respostas()).toEqual([
      '1. Tomate: 35 kg ✓ — por quê?',
      '2. Mamão formosa: 20,5 kg ✓ — por quê?',
    ]);
    const envios = chamadasDe('sendMessage');
    const primeiro = envios[0];
    expect(botoes(primeiro?.payload ?? {}).map((b) => b.text)).toEqual([
      'preço no CEASA',
      'feriado',
      'clima',
      'promoção',
      'estoque errado',
      'outro',
    ]);
    expect(botoes(primeiro?.payload ?? {})[0]?.callback_data).toBe(
      montarCallback({ tipo: 'motivo', itemSugestaoId: 11, motivo: 'price' }),
    );
    expect(deps.sessoes.limpar).not.toHaveBeenCalled();
  });

  it('avisa posições inválidas e linhas não entendidas', async () => {
    const { bot, deps, respostas } = criar({ sessao });
    deps.respostas.ajustar.mockResolvedValue({
      aplicados: [{ ...TOMATE, quantidadeResposta: 35 }],
      posicoesInvalidas: [9],
    });
    await bot.handleUpdate(texto('1 35\n9 4\nbanana'));
    expect(respostas()).toEqual([
      '1. Tomate: 35 kg ✓ — por quê?',
      'Não existe o número 9 no pedido de hoje.',
      'Não entendi: "banana". Use o formato "número quantidade" (ex.: 1 35).',
    ]);
  });

  it('nada válido: mostra a ajuda e não chama o serviço', async () => {
    const { bot, deps, respostas } = criar({ sessao });
    await bot.handleUpdate(texto('não sei'));
    expect(deps.respostas.ajustar).not.toHaveBeenCalled();
    expect(respostas()).toEqual([
      'Não entendi. Mande o número e a quantidade, uma linha por item (ex.: 1 35). Quando terminar, mande ok.',
    ]);
  });
});

describe('callback motivo', () => {
  it('recusa item que não é da sugestão ativa da loja', async () => {
    const { bot, deps, respostas } = criar();
    await bot.handleUpdate(clique({ tipo: 'motivo', itemSugestaoId: 9999, motivo: 'price' }));
    expect(deps.respostas.definirMotivo).not.toHaveBeenCalled();
    expect(respostas()).toEqual([MENSAGEM_PEDIDO_ENCERRADO]);
  });

  const ajustado: ItemSugestao = { ...TOMATE, resposta: 'adjusted', quantidadeResposta: 35 };

  it('salva o motivo e mostra o motivo escolhido na mensagem, sem teclado', async () => {
    const { bot, deps, chamadasDe, respostas } = criar();
    deps.respostas.definirMotivo.mockResolvedValue({ ...ajustado, motivoResposta: 'holiday' });

    await bot.handleUpdate(clique({ tipo: 'motivo', itemSugestaoId: 11, motivo: 'holiday' }));

    expect(chamadasDe('answerCallbackQuery')).toHaveLength(1);
    expect(deps.respostas.definirMotivo).toHaveBeenCalledWith(11, 'holiday');
    const edicao = chamadasDe('editMessageText');
    expect(edicao).toHaveLength(1);
    expect(edicao[0]?.payload.text).toBe('1. Tomate: 35 kg ✓ — motivo: feriado');
    expect(edicao[0]?.payload.reply_markup).toBeUndefined();
    expect(deps.sessoes.salvar).not.toHaveBeenCalled();
    expect(respostas()).toEqual([]);
  });

  it('"outro" pede a nota e muda a sessão para o modo nota', async () => {
    const { bot, deps, respostas } = criar({
      sessao: {
        chatId: CHAT,
        lojaId: LOJA.id,
        modo: 'ajuste',
        sugestaoId: 7,
        itemSugestaoId: null,
      },
    });
    deps.respostas.definirMotivo.mockResolvedValue({ ...ajustado, motivoResposta: 'other' });

    await bot.handleUpdate(clique({ tipo: 'motivo', itemSugestaoId: 11, motivo: 'other' }));

    expect(deps.sessoes.salvar).toHaveBeenCalledWith({
      chatId: CHAT,
      lojaId: LOJA.id,
      modo: 'nota',
      sugestaoId: 7,
      itemSugestaoId: 11,
    });
    expect(respostas()).toEqual(['Escreva o motivo em poucas palavras.']);
  });

  it('"outro" sem sessão: usa a sugestão ativa', async () => {
    const { bot, deps } = criar();
    deps.respostas.definirMotivo.mockResolvedValue({ ...ajustado, motivoResposta: 'other' });
    await bot.handleUpdate(clique({ tipo: 'motivo', itemSugestaoId: 11, motivo: 'other' }));
    expect(deps.sessoes.salvar).toHaveBeenCalledWith(
      expect.objectContaining({ modo: 'nota', sugestaoId: 7, itemSugestaoId: 11 }),
    );
  });

  it('o texto seguinte vira a nota e a sessão volta para ajuste', async () => {
    const { bot, deps, respostas } = criar({
      sessao: { chatId: CHAT, lojaId: LOJA.id, modo: 'nota', sugestaoId: 7, itemSugestaoId: 11 },
    });
    deps.respostas.definirNota.mockResolvedValue(ajustado);

    await bot.handleUpdate(texto('  vai chover na semana  '));

    expect(deps.respostas.definirNota).toHaveBeenCalledWith(11, 'vai chover na semana');
    expect(deps.sessoes.salvar).toHaveBeenCalledWith({
      chatId: CHAT,
      lojaId: LOJA.id,
      modo: 'ajuste',
      sugestaoId: 7,
      itemSugestaoId: null,
    });
    expect(respostas()).toEqual([
      'Anotado. Pode mandar mais ajustes (ex.: 2 20) ou mandar ok para terminar.',
    ]);
  });
});

describe('texto fora de sessão', () => {
  it('"ok" aceita o pedido ativo', async () => {
    const { bot, deps, respostas } = criar();
    deps.respostas.aceitarTudo.mockResolvedValue(SUGESTAO);
    await bot.handleUpdate(texto('Ok'));
    expect(deps.respostas.aceitarTudo).toHaveBeenCalledWith(7);
    expect(respostas()).toEqual(['Anotado! Pedido aceito.']);
    expect(deps.inbox.registrar).not.toHaveBeenCalled();
  });

  it('"ok" sem pedido aberto: avisa', async () => {
    const { bot, deps, respostas } = criar({ ativa: null });
    await bot.handleUpdate(texto('ok'));
    expect(deps.respostas.aceitarTudo).not.toHaveBeenCalled();
    expect(respostas()).toEqual(['Não tem nenhum pedido aberto agora.']);
  });

  it('"tudo" lista os pedidos numerados', async () => {
    const { bot, respostas } = criar();
    await bot.handleUpdate(texto('tudo'));
    expect(respostas()).toEqual([
      '1. Tomate — 40 kg\n2. Mamão formosa — 12 kg\n3. Alface — 20 maço',
    ]);
  });

  it('qualquer outra coisa: não entendi e vai para a caixa de entrada', async () => {
    const { bot, deps, respostas } = criar();
    await bot.handleUpdate(texto('bom dia, quanto custa?'));
    expect(respostas()).toEqual([MENSAGEM_NAO_ENTENDI]);
    expect(deps.inbox.registrar).toHaveBeenCalledWith({
      lojaId: LOJA.id,
      chatId: CHAT,
      texto: 'bom dia, quanto custa?',
    });
  });

  it('chat não vinculado: boas-vindas e inbox sem loja', async () => {
    const { bot, deps, respostas } = criar({ loja: null });
    await bot.handleUpdate(texto('oi'));
    expect(respostas()).toEqual([MENSAGEM_BOAS_VINDAS]);
    expect(deps.inbox.registrar).toHaveBeenCalledWith({ lojaId: null, chatId: CHAT, texto: 'oi' });
  });

  it('sessão de outra loja é ignorada', async () => {
    const { bot, deps, respostas } = criar({
      sessao: { chatId: CHAT, lojaId: 99, modo: 'ajuste', sugestaoId: 7, itemSugestaoId: null },
    });
    await bot.handleUpdate(texto('1 35'));
    expect(deps.respostas.ajustar).not.toHaveBeenCalled();
    expect(respostas()).toEqual([MENSAGEM_NAO_ENTENDI]);
  });
});

describe('comandos /perda, /falta e /estoque', () => {
  const MAMAO_FORMOSA = itemFalso({ id: 1, nome: 'Mamão formosa' });
  const MAMAO_PAPAIA = itemFalso({ id: 2, nome: 'Mamão papaia' });
  const TOMATE_ITEM = itemFalso({ id: 3, nome: 'Tomate' });
  const ALFACE_ITEM = itemFalso({ id: 4, nome: 'Alface', unidade: 'maco' });
  const itens = [MAMAO_FORMOSA, MAMAO_PAPAIA, TOMATE_ITEM, ALFACE_ITEM];

  it('/perda com um item só: registra e confirma', async () => {
    const { bot, deps, respostas } = criar({ itens });
    deps.registros.registrarPerda.mockResolvedValue({} as never);
    await bot.handleUpdate(comando('/perda mamão formosa 6'));
    expect(deps.registros.registrarPerda).toHaveBeenCalledWith(1, { itemId: 1, quantidade: 6 });
    expect(respostas()).toEqual(['Anotado: 6 kg de Mamão formosa descartados hoje.']);
  });

  it('/perda com vírgula decimal e unidade', async () => {
    const { bot, deps, respostas } = criar({ itens });
    deps.registros.registrarPerda.mockResolvedValue({} as never);
    await bot.handleUpdate(comando('/perda tomate 2,5 kg'));
    expect(deps.registros.registrarPerda).toHaveBeenCalledWith(1, { itemId: 3, quantidade: 2.5 });
    expect(respostas()).toEqual(['Anotado: 2,5 kg de Tomate descartados hoje.']);
  });

  it('/falta registra a falta', async () => {
    const { bot, deps, respostas } = criar({ itens });
    deps.registros.registrarFalta.mockResolvedValue({} as never);
    await bot.handleUpdate(comando('/falta alface'));
    expect(deps.registros.registrarFalta).toHaveBeenCalledWith(1, { itemId: 4 });
    expect(respostas()).toEqual(['Anotado: faltou Alface hoje.']);
  });

  it('/estoque registra a contagem com origem owner', async () => {
    const { bot, deps, respostas } = criar({ itens });
    deps.registros.registrarContagem.mockResolvedValue({} as never);
    await bot.handleUpdate(comando('/estoque tomate 15kg'));
    expect(deps.registros.registrarContagem).toHaveBeenCalledWith(1, {
      itemId: 3,
      quantidade: 15,
      origem: 'owner',
    });
    expect(respostas()).toEqual(['Anotado: Tomate agora tem 15 kg em estoque.']);
  });

  it('/estoque aceita zero', async () => {
    const { bot, deps } = criar({ itens });
    deps.registros.registrarContagem.mockResolvedValue({} as never);
    await bot.handleUpdate(comando('/estoque alface 0'));
    expect(deps.registros.registrarContagem).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ itemId: 4, quantidade: 0 }),
    );
  });

  it('item não encontrado: mostra exemplos', async () => {
    const { bot, deps, respostas } = criar({ itens });
    await bot.handleUpdate(comando('/perda abacaxi 3'));
    expect(deps.registros.registrarPerda).not.toHaveBeenCalled();
    expect(respostas()).toEqual([
      "Não achei 'abacaxi'. Alguns itens que conheço: Mamão formosa, Mamão papaia, Tomate, Alface.",
    ]);
  });

  it('mais de um candidato: pergunta "Qual deles?" com um botão por item', async () => {
    const { bot, deps, respostas, chamadasDe } = criar({ itens });
    await bot.handleUpdate(comando('/perda mamão 6,5'));
    expect(deps.registros.registrarPerda).not.toHaveBeenCalled();
    expect(respostas()).toEqual(['Qual deles?']);
    const lista = botoes(chamadasDe('sendMessage')[0]?.payload ?? {});
    expect(lista.map((b) => b.text)).toEqual(['Mamão formosa', 'Mamão papaia']);
    expect(lista.map((b) => b.callback_data)).toEqual([
      montarCallback({ tipo: 'item', acao: 'perda', itemId: 1, quantidade: 6.5 }),
      montarCallback({ tipo: 'item', acao: 'perda', itemId: 2, quantidade: 6.5 }),
    ]);
  });

  it('clique no botão executa a ação escolhida', async () => {
    const { bot, deps, respostas, chamadasDe } = criar({ itens });
    deps.registros.registrarPerda.mockResolvedValue({} as never);
    await bot.handleUpdate(clique({ tipo: 'item', acao: 'perda', itemId: 2, quantidade: 6.5 }));
    expect(chamadasDe('answerCallbackQuery')).toHaveLength(1);
    expect(deps.registros.registrarPerda).toHaveBeenCalledWith(1, { itemId: 2, quantidade: 6.5 });
    expect(respostas()).toEqual(['Anotado: 6,5 kg de Mamão papaia descartados hoje.']);
  });

  it('clique para /falta e /estoque', async () => {
    const { bot, deps } = criar({ itens });
    deps.registros.registrarFalta.mockResolvedValue({} as never);
    deps.registros.registrarContagem.mockResolvedValue({} as never);
    await bot.handleUpdate(clique({ tipo: 'item', acao: 'falta', itemId: 1, quantidade: null }));
    await bot.handleUpdate(clique({ tipo: 'item', acao: 'estoque', itemId: 1, quantidade: 8 }));
    expect(deps.registros.registrarFalta).toHaveBeenCalledWith(1, { itemId: 1 });
    expect(deps.registros.registrarContagem).toHaveBeenCalledWith(1, {
      itemId: 1,
      quantidade: 8,
      origem: 'owner',
    });
  });

  it.each([
    ['/perda mamão', 'Diga o item e quanto perdeu. Exemplo: /perda mamão 6'],
    ['/perda', 'Diga o item e quanto perdeu. Exemplo: /perda mamão 6'],
    ['/perda tomate 0', 'Diga o item e quanto perdeu. Exemplo: /perda mamão 6'],
    ['/estoque tomate', 'Diga o item e quanto tem agora. Exemplo: /estoque tomate 15'],
    ['/falta', 'Diga qual item faltou. Exemplo: /falta tomate'],
  ])('%s mostra o uso', async (entrada, uso) => {
    const { bot, deps, respostas } = criar({ itens });
    await bot.handleUpdate(comando(entrada));
    expect(respostas()).toEqual([uso]);
    expect(deps.registros.registrarPerda).not.toHaveBeenCalled();
    expect(deps.registros.registrarContagem).not.toHaveBeenCalled();
    expect(deps.registros.registrarFalta).not.toHaveBeenCalled();
  });

  it('chat sem loja', async () => {
    const { bot, respostas } = criar({ loja: null, itens });
    await bot.handleUpdate(comando('/perda mamão 6'));
    expect(respostas()).toEqual([MENSAGEM_CHAT_SEM_LOJA]);
  });

  it('erro ao registrar: registra o erro e responde algo amigável', async () => {
    const { bot, deps, respostas } = criar({ itens });
    deps.registros.registrarPerda.mockRejectedValue(new Error('falhou'));
    await bot.handleUpdate(comando('/perda tomate 3'));
    expect(deps.registrarErro).toHaveBeenCalledOnce();
    expect(respostas()).toEqual([MENSAGEM_ERRO_GENERICO]);
  });
});
