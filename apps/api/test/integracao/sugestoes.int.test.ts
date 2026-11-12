import type { Canal } from '@giro/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { semearLoja } from './banco';
import {
  calendarEvents,
  inboxMessages,
  salesImports,
  stockCounts,
  stockouts,
  stores,
  suggestionItems,
  suggestions,
} from '../../src/db/schema';
import type { Db } from '../../src/db/client';
import { ErroHttp } from '../../src/erros';
import { criarServicoImportacoes } from '../../src/modules/imports/service';
import type { EnvioSugestao, MessagingChannel } from '../../src/modules/messaging/canal';
import { ManualChannel } from '../../src/modules/messaging/manual-channel';
import { criarServicoSugestoes } from '../../src/modules/suggestions/service';
import { ARQUIVO_28_DIAS_CSV, lerFixture } from '../imports/fixtures';
import { criarBancoDeTeste, type BancoDeTeste } from './banco';

const DATA = '2026-11-09';
/** 05:30 em São Paulo */
const AGORA = new Date('2026-11-09T08:30:00Z');

function canalTelegramFake(opcoes: { atraso?: number; falhar?: () => Error | null } = {}) {
  const enviados: EnvioSugestao[] = [];
  const canal: MessagingChannel = {
    canal: 'telegram',
    async enviarSugestao(envio) {
      if (opcoes.atraso) await new Promise((r) => setTimeout(r, opcoes.atraso));
      const erro = opcoes.falhar?.();
      if (erro) throw erro;
      enviados.push(envio);
      return { telegramMessageId: 4242 };
    },
  };
  return { canal, enviados };
}

function criarServico(db: Db, telegram: MessagingChannel | null) {
  return criarServicoSugestoes(db, {
    canais: { telegram, manual: new ManualChannel() },
    agora: () => AGORA,
  });
}

/** loja nova com os 20 itens e as vendas de 12/10 a 08/11 importadas */
async function lojaComVendas(db: Db, canal: Canal = 'manual') {
  const { lojaId, idDoItem } = await semearLoja(db);
  await criarServicoImportacoes(db).importar({
    lojaId,
    origem: 'pdv_csv',
    nomeArquivo: ARQUIVO_28_DIAS_CSV,
    conteudo: lerFixture(ARQUIVO_28_DIAS_CSV),
  });
  if (canal === 'telegram') {
    await db
      .update(stores)
      .set({ channel: 'telegram', telegramChatId: 555 })
      .where(eq(stores.id, lojaId));
  }
  return { lojaId, idDoItem };
}

describe('serviço de sugestões no Postgres', () => {
  let banco: BancoDeTeste;
  let db: Db;

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    db = banco.db;
  });
  afterAll(() => banco.descartar());

  it('gera 20 itens com posições só nos pedidos e a mensagem do dia', async () => {
    const { lojaId } = await lojaComVendas(db);
    const sugestao = await criarServico(db, null).gerar(lojaId, { data: DATA });

    expect(sugestao.data).toBe(DATA);
    expect(sugestao.status).toBe('draft');
    expect(sugestao.canal).toBe('manual');
    expect(sugestao.enviadaEm).toBeNull();
    expect(sugestao.itens).toHaveLength(20);

    const pedidos = sugestao.itens.filter((i) => i.acao === 'order');
    expect(pedidos.length).toBeGreaterThan(0);
    expect(pedidos.map((i) => i.posicao).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(
      pedidos.map((_, i) => i + 1),
    );
    for (const item of sugestao.itens.filter((i) => i.acao !== 'order')) {
      expect(item.posicao).toBeNull();
    }
    expect(sugestao.mensagem).toContain('Bom dia, Seu Antônio! Sugestão de hoje (seg 09/11):');
    expect(sugestao.mensagem).toContain('Responda *ok*');
  });

  it('usa a data de hoje no fuso da loja quando não recebe data', async () => {
    const { lojaId } = await lojaComVendas(db);
    const sugestao = await criarServico(db, null).gerar(lojaId, {});
    expect(sugestao.data).toBe(DATA);
  });

  it('é idempotente: segunda chamada e chamadas paralelas devolvem o mesmo id', async () => {
    const { lojaId } = await lojaComVendas(db);
    const servico = criarServico(db, null);
    const [a, b] = await Promise.all([
      servico.gerar(lojaId, { data: DATA }),
      servico.gerar(lojaId, { data: DATA }),
    ]);
    expect(a.id).toBe(b.id);
    const c = await servico.gerar(lojaId, { data: DATA });
    expect(c.id).toBe(a.id);
    const linhas = await db.select().from(suggestions).where(eq(suggestions.storeId, lojaId));
    expect(linhas).toHaveLength(1);
  });

  it('404 para loja inexistente e para data sem sugestão', async () => {
    const { lojaId } = await lojaComVendas(db);
    const servico = criarServico(db, null);
    await expect(servico.gerar(999_999, { data: DATA })).rejects.toMatchObject({ status: 404 });
    await expect(servico.buscarPorData(lojaId, DATA)).rejects.toMatchObject({ status: 404 });
    const gerada = await servico.gerar(lojaId, { data: DATA });
    await expect(servico.buscarPorData(lojaId, DATA)).resolves.toEqual(gerada);
  });

  it('refazer recalcula o rascunho com o mesmo id; sem refazer não mexe', async () => {
    const { lojaId } = await lojaComVendas(db);
    const servico = criarServico(db, null);
    const antes = await servico.gerar(lojaId, { data: DATA });
    const semRefazer = await servico.gerar(lojaId, { data: DATA });
    expect(semRefazer.itens.map((i) => i.id)).toEqual(antes.itens.map((i) => i.id));

    const depois = await servico.gerar(lojaId, { data: DATA, refazer: true });
    expect(depois.id).toBe(antes.id);
    expect(depois.itens).toHaveLength(20);
    expect(depois.itens.map((i) => i.id)).not.toEqual(antes.itens.map((i) => i.id));
  });

  it('contagem recente muda o estoque estimado e tira a estimativa fraca', async () => {
    const { lojaId, idDoItem } = await lojaComVendas(db);
    const servico = criarServico(db, null);
    const antes = await servico.gerar(lojaId, { data: DATA });
    const tomateAntes = antes.itens.find((i) => i.itemId === idDoItem('Tomate'));
    expect(tomateAntes?.estimativaFraca).toBe(true);

    // 08/11 12:00 em São Paulo
    await db.insert(stockCounts).values({
      storeId: lojaId,
      itemId: idDoItem('Tomate'),
      countedAt: new Date('2026-11-08T15:00:00Z'),
      quantity: 100,
      source: 'owner',
    });
    const depois = await servico.gerar(lojaId, { data: DATA, refazer: true });
    const tomate = depois.itens.find((i) => i.itemId === idDoItem('Tomate'));
    expect(tomate?.estimativaFraca).toBe(false);
    expect(tomate?.estoqueEstimado).toBe(100);
    expect(tomateAntes?.estoqueEstimado).not.toBe(100);
  });

  it('evento de feira com fator 1,3 aumenta a previsão', async () => {
    const { lojaId } = await lojaComVendas(db);
    const servico = criarServico(db, null);
    const total = (s: Awaited<ReturnType<typeof servico.gerar>>) =>
      s.itens.reduce((soma, i) => soma + i.previsao, 0);
    const antes = await servico.gerar(lojaId, { data: DATA });

    await db.insert(calendarEvents).values({
      storeId: lojaId,
      eventDate: DATA,
      kind: 'fair',
      label: 'Feira',
      demandFactor: 1.3,
    });
    const depois = await servico.gerar(lojaId, { data: DATA, refazer: true });
    expect(total(depois)).toBeGreaterThan(total(antes));
  });

  it('falta registrada sobe a margem do pedido', async () => {
    const { lojaId, idDoItem } = await lojaComVendas(db);
    const servico = criarServico(db, null);
    const antes = await servico.gerar(lojaId, { data: DATA });
    const total = (s: typeof antes) => s.itens.reduce((soma, i) => soma + i.quantidadeSugerida, 0);

    const nomes = ['Tomate', 'Cebola', 'Batata'];
    await db.insert(stockouts).values(
      nomes.map((nome) => ({
        storeId: lojaId,
        itemId: idDoItem(nome),
        reportedDate: '2026-11-05',
      })),
    );
    const depois = await servico.gerar(lojaId, { data: DATA, refazer: true });
    expect(total(depois)).toBeGreaterThan(total(antes));
  });

  it('enviar no canal manual marca como enviada, sem reenviar depois', async () => {
    const { lojaId } = await lojaComVendas(db);
    const servico = criarServico(db, null);
    const gerada = await servico.gerar(lojaId, { data: DATA });
    const enviada = await servico.enviar(gerada.id);
    expect(enviada.status).toBe('sent');
    expect(enviada.enviadaEm).not.toBeNull();

    const outra = await servico.enviar(gerada.id);
    expect(outra.enviadaEm).toBe(enviada.enviadaEm);
    await expect(servico.enviar(999_999)).rejects.toMatchObject({ status: 404 });
  });

  it('enviar no telegram grava telegram_message_id e regenera o texto para o canal', async () => {
    const { lojaId } = await lojaComVendas(db);
    const { canal, enviados } = canalTelegramFake();
    const servico = criarServico(db, canal);
    // gerada com a loja ainda no canal manual
    const gerada = await servico.gerar(lojaId, { data: DATA });
    expect(gerada.mensagem).toContain('Responda *ok*');
    await db
      .update(stores)
      .set({ channel: 'telegram', telegramChatId: 555 })
      .where(eq(stores.id, lojaId));

    const enviada = await servico.enviar(gerada.id);
    expect(enviada.status).toBe('sent');
    expect(enviada.canal).toBe('telegram');
    expect(enviada.mensagem).not.toContain('Responda *ok*');
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({
      sugestaoId: gerada.id,
      texto: enviada.mensagem,
      destino: { lojaId, telegramChatId: 555 },
    });
    const [linha] = await db.select().from(suggestions).where(eq(suggestions.id, gerada.id));
    expect(linha?.telegramMessageId).toBe(4242);
  });

  it('telegram sem bot ou sem chat vinculado responde 400 e não deixa reserva', async () => {
    const { lojaId } = await lojaComVendas(db, 'telegram');
    const gerada = await criarServico(db, null).gerar(lojaId, { data: DATA });
    await expect(criarServico(db, null).enviar(gerada.id)).rejects.toMatchObject({
      status: 400,
      message: 'Bot do Telegram desativado',
    });

    await db.update(stores).set({ telegramChatId: null }).where(eq(stores.id, lojaId));
    const { canal } = canalTelegramFake();
    await expect(criarServico(db, canal).enviar(gerada.id)).rejects.toMatchObject({
      status: 400,
      message: 'Loja sem Telegram vinculado',
    });
    const [linha] = await db.select().from(suggestions).where(eq(suggestions.id, gerada.id));
    expect(linha?.sentAt).toBeNull();
    expect(linha?.status).toBe('draft');
  });

  it('duas chamadas de enviar em paralelo enviam uma única vez', async () => {
    const { lojaId } = await lojaComVendas(db, 'telegram');
    const { canal, enviados } = canalTelegramFake({ atraso: 50 });
    const servico = criarServico(db, canal);
    const gerada = await servico.gerar(lojaId, { data: DATA });

    const [a, b] = await Promise.all([servico.enviar(gerada.id), servico.enviar(gerada.id)]);
    expect(enviados).toHaveLength(1);
    expect(a.id).toBe(b.id);
    expect(a.status).toBe('sent');
  });

  it('falha do canal desfaz a reserva, devolve 502 sem vazar o token e permite tentar de novo', async () => {
    const { lojaId } = await lojaComVendas(db, 'telegram');
    let falhar: Error | null = new Error(
      'Network request failed: https://api.telegram.org/bot123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw/sendMessage',
    );
    const { canal, enviados } = canalTelegramFake({ falhar: () => falhar });
    const servico = criarServico(db, canal);
    const gerada = await servico.gerar(lojaId, { data: DATA });

    const erro = await servico.enviar(gerada.id).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroHttp);
    expect((erro as ErroHttp).status).toBe(502);
    expect((erro as ErroHttp).message).toContain('Falha ao enviar pelo Telegram');
    expect((erro as ErroHttp).message).not.toContain('AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw');
    const [linha] = await db.select().from(suggestions).where(eq(suggestions.id, gerada.id));
    expect(linha?.sentAt).toBeNull();
    expect(linha?.status).toBe('draft');
    expect(linha?.telegramMessageId).toBeNull();

    falhar = null;
    const ok = await servico.enviar(gerada.id);
    expect(ok.status).toBe('sent');
    expect(enviados).toHaveLength(1);
  });

  it('refazer em sugestão já enviada devolve a existente sem mexer', async () => {
    const { lojaId } = await lojaComVendas(db);
    const servico = criarServico(db, null);
    const gerada = await servico.gerar(lojaId, { data: DATA });
    await servico.enviar(gerada.id);
    const outra = await servico.gerar(lojaId, { data: DATA, refazer: true });
    expect(outra.status).toBe('sent');
    expect(outra.itens.map((i) => i.id)).toEqual(gerada.itens.map((i) => i.id));
  });

  it('expirar marca ignored sem responded_at e preserva as respondidas', async () => {
    const { lojaId } = await lojaComVendas(db);
    const servico = criarServico(db, null);
    const gerada = await servico.gerar(lojaId, { data: DATA });
    await servico.enviar(gerada.id);
    const [respondido, ...resto] = gerada.itens;
    const resposta = new Date('2026-11-09T12:00:00Z');
    await db
      .update(suggestionItems)
      .set({ response: 'accepted', respondedAt: resposta })
      .where(eq(suggestionItems.id, respondido!.id));

    // hoje ainda é o mesmo dia: nada expira
    expect(await servico.expirarPendentes(lojaId, DATA)).toBe(0);
    expect(await servico.expirarPendentes(lojaId, '2026-11-10')).toBe(1);

    const depois = await servico.buscarPorData(lojaId, DATA);
    expect(depois.status).toBe('expired');
    expect(depois.itens.find((i) => i.id === respondido!.id)?.resposta).toBe('accepted');
    for (const item of depois.itens.filter((i) => resto.some((r) => r.id === i.id))) {
      expect(item.resposta).toBe('ignored');
      expect(item.respondidoEm).toBeNull();
    }
    expect(await servico.expirarPendentes(lojaId, '2026-11-10')).toBe(0);
  });
});

describe('painel Hoje e rotina diária no Postgres', () => {
  let banco: BancoDeTeste;
  let db: Db;
  let lojaTelegram: number;
  let lojaManual: number;
  let lojaSemChat: number;

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    db = banco.db;
    ({ lojaId: lojaTelegram } = await lojaComVendas(db, 'telegram'));
    ({ lojaId: lojaManual } = await lojaComVendas(db, 'manual'));
    ({ lojaId: lojaSemChat } = await semearLoja(db));
    await db.update(stores).set({ autoSend: true }).where(eq(stores.autoSend, false));
    await db
      .update(stores)
      .set({ channel: 'telegram', telegramChatId: null })
      .where(eq(stores.id, lojaSemChat));
  });
  afterAll(() => banco.descartar());

  it('painelHoje lista as lojas com sugestão, pendências e caixa de entrada', async () => {
    const servico = criarServico(db, null);
    const vazio = await servico.painelHoje(DATA);
    expect(vazio.data).toBe(DATA);
    expect(vazio.lojas.map((l) => l.loja.id)).toEqual([lojaTelegram, lojaManual, lojaSemChat]);
    expect(vazio.lojas.every((l) => l.sugestao === null)).toBe(true);
    expect(vazio.lojas[0]?.ultimoDiaComVendas).toBe('2026-11-08');
    expect(vazio.lojas[2]?.ultimoDiaComVendas).toBeNull();

    await servico.gerar(lojaManual, { data: DATA });
    await db.insert(salesImports).values({
      storeId: lojaSemChat,
      source: 'manual',
      rowsUnmatched: 3,
    });
    await db.insert(inboxMessages).values([
      { telegramChatId: 1, text: 'oi' },
      { telegramChatId: 2, text: 'resolvida', resolvedAt: new Date() },
    ]);

    const painel = await servico.painelHoje();
    // sem data: usa hoje em São Paulo pelo relógio injetado
    expect(painel.data).toBe(DATA);
    expect(painel.lojas[1]?.sugestao?.lojaId).toBe(lojaManual);
    expect(painel.lojas[0]?.sugestao).toBeNull();
    expect(painel.lojas[2]?.importacoesPendentes).toBe(1);
    expect(painel.inboxAbertas).toBe(1);
  });

  it('rotina diária expira, gera e envia só quando auto_send + telegram + chat vinculado', async () => {
    // sugestão enviada ontem, sem resposta, na loja manual
    await db.insert(suggestions).values({
      storeId: lojaManual,
      suggestionDate: '2026-11-08',
      status: 'sent',
      channel: 'manual',
      sentAt: new Date('2026-11-08T08:30:00Z'),
    });
    const { canal, enviados } = canalTelegramFake();
    const servico = criarServico(db, canal);

    const resumo = await servico.executarRotinaDiaria();
    expect(resumo).toMatchObject({ lojas: 3, geradas: 2, enviadas: 1, expiradas: 1, erros: [] });
    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.destino.lojaId).toBe(lojaTelegram);

    const [telegram] = await db
      .select()
      .from(suggestions)
      .where(and(eq(suggestions.storeId, lojaTelegram), eq(suggestions.suggestionDate, DATA)));
    expect(telegram?.status).toBe('sent');
    const [semChat] = await db
      .select()
      .from(suggestions)
      .where(and(eq(suggestions.storeId, lojaSemChat), eq(suggestions.suggestionDate, DATA)));
    expect(semChat?.status).toBe('draft');

    // segunda rodada no mesmo dia: nada novo
    const segunda = await servico.executarRotinaDiaria();
    expect(segunda).toMatchObject({ geradas: 0, enviadas: 0, expiradas: 0, erros: [] });
    expect(enviados).toHaveLength(1);
  });

  it('erro numa loja vai para erros e não para as outras', async () => {
    const { canal } = canalTelegramFake({ falhar: () => new Error('telegram fora do ar') });
    // outro dia: força gerar de novo para as três lojas
    const outroDia = criarServicoSugestoes(db, {
      canais: { telegram: canal, manual: new ManualChannel() },
      agora: () => new Date('2026-11-10T08:30:00Z'),
    });
    const resumo = await outroDia.executarRotinaDiaria();
    expect(resumo.lojas).toBe(3);
    expect(resumo.geradas).toBe(3);
    expect(resumo.enviadas).toBe(0);
    expect(resumo.erros).toHaveLength(1);
    expect(resumo.erros[0]?.lojaId).toBe(lojaTelegram);
    expect(resumo.erros[0]?.erro).toContain('telegram fora do ar');
  });
});
