import type { ResumoImportacao } from '@giro/shared';
import type { UserFromGetMe } from 'grammy/types';
import { describe, expect, it, vi } from 'vitest';
import { lerTabela } from '../../src/modules/imports/arquivo';
import { agruparVendas, criarIndiceItens } from '../../src/modules/imports/casamento';
import { parsearVendas } from '../../src/modules/imports/parser';
import type { EntradaImportacao } from '../../src/modules/imports/service';
import type { LojaDoChat } from '../../src/modules/stores/service';
import { criarBot } from '../../src/modules/telegram/bot';
import type { DependenciasBot } from '../../src/modules/telegram/dependencias';
import {
  MENSAGEM_BOAS_VINDAS,
  MENSAGEM_CHAT_SEM_LOJA,
  MENSAGEM_CODIGO_INVALIDO,
  MENSAGEM_FALHA_PROCESSAMENTO,
  MENSAGEM_FORMATO_INVALIDO,
} from '../../src/modules/telegram/mensagens';
import {
  ARQUIVO_28_DIAS_CSV,
  ARQUIVO_28_DIAS_XLSX,
  CATALOGO,
  lerFixture,
} from '../imports/fixtures';
import { servicosNaoUsados } from './fakes';

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

const CHAT_DONO = 555;
const LOJA: LojaDoChat = { id: 1, nome: 'Hortifruti Bom Preço', nomeDono: 'Seu Antônio' };

/** Importação fake que usa o parser e o casamento reais, sem banco. */
function importarSemBanco(entrada: EntradaImportacao): Promise<ResumoImportacao> {
  const parse = parsearVendas(lerTabela(entrada.conteudo, entrada.nomeArquivo));
  if (!parse.ok) throw new Error(parse.erro);
  const grupos = agruparVendas(parse.linhas, criarIndiceItens(CATALOGO), new Set());
  const pendentes = grupos.filter((g) => g.itemId === null);
  const soma = (gs: typeof grupos) => gs.reduce((s, g) => s + g.linhas, 0);
  return Promise.resolve({
    importacao: {
      id: 1,
      lojaId: entrada.lojaId,
      origem: entrada.origem,
      nomeArquivo: entrada.nomeArquivo,
      inicioPeriodo: parse.periodo.inicio,
      fimPeriodo: parse.periodo.fim,
      linhasTotal: soma(grupos),
      linhasMapeadas: soma(grupos.filter((g) => g.itemId !== null)),
      linhasNaoMapeadas: soma(pendentes),
      status: 'done',
      erro: null,
      criadoEm: '2026-11-12T10:00:00.000Z',
    },
    colunas: parse.colunas,
    cabecalhos: [],
    naoMapeados: [...new Set(pendentes.map((g) => g.normalizada))].map((normalizada) => ({
      normalizada,
      descricao: normalizada,
      codigo: null,
      linhas: 1,
      quantidade: 1,
    })),
    descartadas: parse.descartadas,
  });
}

function criarBotDeTeste(opcoes: { lojaVinculada?: LojaDoChat | null; arquivo?: Uint8Array } = {}) {
  const chamadas: { metodo: string; payload: Record<string, unknown> }[] = [];
  const deps = {
    ...servicosNaoUsados(),
    lojas: {
      vincularChat: vi.fn((codigo: string) => Promise.resolve(codigo === 'ABC234' ? LOJA : null)),
      lojaDoChat: vi.fn(() => Promise.resolve(opcoes.lojaVinculada ?? null)),
      itens: vi.fn(() => Promise.resolve([])),
    },
    importacoes: { importar: vi.fn(importarSemBanco) },
    baixarArquivo: vi.fn(() => Promise.resolve(opcoes.arquivo ?? new Uint8Array())),
    registrarErro: vi.fn(),
    config: { botInfo },
  } satisfies DependenciasBot;

  const bot = criarBot('123:fake', deps);
  bot.api.config.use((_prev, metodo, payload) => {
    chamadas.push({ metodo, payload });
    const result =
      metodo === 'getFile'
        ? { file_id: 'f1', file_unique_id: 'u1', file_path: 'documents/file_1.csv' }
        : { message_id: 1 };
    return Promise.resolve({ ok: true, result: result as never });
  });
  const respostas = () =>
    chamadas.filter((c) => c.metodo === 'sendMessage').map((c) => c.payload.text);
  return { bot, deps, chamadas, respostas };
}

const base = {
  update_id: 1,
  message: {
    message_id: 10,
    date: 1_794_000_000,
    chat: { id: CHAT_DONO, type: 'private' as const, first_name: 'Antônio' },
    from: { id: CHAT_DONO, is_bot: false, first_name: 'Antônio' },
  },
};

function comando(texto: string) {
  const nome = texto.split(' ')[0] ?? texto;
  return {
    ...base,
    message: {
      ...base.message,
      text: texto,
      entities: [{ type: 'bot_command' as const, offset: 0, length: nome.length }],
    },
  };
}

function documento(nome: string, tamanho = 38_346) {
  return {
    ...base,
    message: {
      ...base.message,
      document: { file_id: 'f1', file_unique_id: 'u1', file_name: nome, file_size: tamanho },
    },
  };
}

describe('bot — /start', () => {
  it('sem código e sem loja vinculada: pede o link de vinculação', async () => {
    const { bot, respostas } = criarBotDeTeste();
    await bot.handleUpdate(comando('/start'));
    expect(respostas()).toEqual([MENSAGEM_BOAS_VINDAS]);
  });

  it('com código válido: vincula o chat à loja', async () => {
    const { bot, deps, respostas } = criarBotDeTeste();
    await bot.handleUpdate(comando('/start ABC234'));
    expect(deps.lojas.vincularChat).toHaveBeenCalledWith('ABC234', CHAT_DONO);
    expect(respostas()).toEqual([
      'Pronto, Seu Antônio! Este chat agora é da loja Hortifruti Bom Preço. Quando quiser, me mande aqui o arquivo de vendas exportado do PDV.',
    ]);
  });

  it('com código inválido: avisa', async () => {
    const { bot, respostas } = criarBotDeTeste();
    await bot.handleUpdate(comando('/start XXXXXX'));
    expect(respostas()).toEqual([MENSAGEM_CODIGO_INVALIDO]);
  });

  it('não responde a texto que não é comando nem documento', async () => {
    const { bot, chamadas } = criarBotDeTeste({ lojaVinculada: LOJA });
    await bot.handleUpdate({ ...base, message: { ...base.message, text: 'bom dia' } });
    expect(chamadas).toHaveLength(0);
  });
});

describe('bot — documento com as vendas do PDV', () => {
  it('importa o arquivo de exemplo (CSV) e responde o resumo', async () => {
    const arquivo = lerFixture(ARQUIVO_28_DIAS_CSV);
    const { bot, deps, chamadas, respostas } = criarBotDeTeste({ lojaVinculada: LOJA, arquivo });

    await bot.handleUpdate(documento(ARQUIVO_28_DIAS_CSV));

    expect(chamadas[0]).toMatchObject({ metodo: 'getFile', payload: { file_id: 'f1' } });
    expect(deps.baixarArquivo).toHaveBeenCalledWith('documents/file_1.csv');
    expect(deps.importacoes.importar).toHaveBeenCalledWith({
      lojaId: LOJA.id,
      origem: 'telegram',
      nomeArquivo: ARQUIVO_28_DIAS_CSV,
      conteudo: arquivo,
    });
    expect(respostas()).toEqual([
      'Recebi! 717 linhas de venda de 12/10 a 08/11. 5 itens que não reconheci (o operador vai mapear).',
    ]);
  });

  it('aceita a versão XLSX do mesmo arquivo', async () => {
    const arquivo = lerFixture(ARQUIVO_28_DIAS_XLSX);
    const { bot, respostas } = criarBotDeTeste({ lojaVinculada: LOJA, arquivo });
    await bot.handleUpdate(documento(ARQUIVO_28_DIAS_XLSX));
    expect(respostas()).toEqual([
      'Recebi! 717 linhas de venda de 12/10 a 08/11. 5 itens que não reconheci (o operador vai mapear).',
    ]);
  });

  it('chat sem loja vinculada: não baixa o arquivo e explica', async () => {
    const { bot, deps, respostas } = criarBotDeTeste({ lojaVinculada: null });
    await bot.handleUpdate(documento(ARQUIVO_28_DIAS_CSV));
    expect(deps.baixarArquivo).not.toHaveBeenCalled();
    expect(respostas()).toEqual([MENSAGEM_CHAT_SEM_LOJA]);
  });

  it('formato que não é CSV/Excel: recusa sem baixar', async () => {
    const { bot, deps, respostas } = criarBotDeTeste({ lojaVinculada: LOJA });
    await bot.handleUpdate(documento('fechamento.pdf'));
    expect(deps.baixarArquivo).not.toHaveBeenCalled();
    expect(respostas()).toEqual([MENSAGEM_FORMATO_INVALIDO]);
  });

  it('arquivo acima de 10 MB: recusa sem baixar', async () => {
    const { bot, deps, respostas } = criarBotDeTeste({ lojaVinculada: LOJA });
    await bot.handleUpdate(documento('vendas.csv', 11 * 1024 * 1024));
    expect(deps.baixarArquivo).not.toHaveBeenCalled();
    expect(respostas()[0]).toMatch(/grande demais/);
  });

  it('erro inesperado: registra e ainda responde ao dono', async () => {
    const { bot, deps, respostas } = criarBotDeTeste({ lojaVinculada: LOJA });
    deps.baixarArquivo.mockRejectedValueOnce(new Error('HTTP 502'));
    await bot.handleUpdate(documento('vendas.csv'));
    expect(deps.registrarErro).toHaveBeenCalledOnce();
    expect(respostas()).toEqual([MENSAGEM_FALHA_PROCESSAMENTO]);
  });
});
