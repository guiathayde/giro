import { metricasCanaisSchema, metricasLojaSchema } from '@giro/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  losses,
  salesDaily,
  stockouts,
  stores,
  suggestionItems,
  suggestions,
} from '../../src/db/schema';
import { criarServicoMetricas } from '../../src/modules/metricas/service';
import { criarBancoDeTeste, semearLoja, type BancoDeTeste } from './banco';

// "hoje" = segunda 2026-11-16; vendas desde 2026-11-02 (baseline 02–08), sugestões desde 09
const AGORA = new Date('2026-11-16T15:00:00Z');

describe('métricas do piloto no Postgres', () => {
  let banco: BancoDeTeste;
  let lojaId: number;
  let outraLojaId: number;
  let idDoItem: (nome: string) => number;
  let servico: ReturnType<typeof criarServicoMetricas>;

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    const { db } = banco;
    ({ lojaId, idDoItem } = await semearLoja(db));
    servico = criarServicoMetricas(db, { agora: () => AGORA });
    const tomate = idDoItem('Tomate');
    const cebola = idDoItem('Cebola');
    const batata = idDoItem('Batata');
    const alface = idDoItem('Alface crespa');

    const [outra] = await db
      .insert(stores)
      .values({ name: 'Sem dados', ownerName: 'Maria', channel: 'telegram', telegramChatId: 42 })
      .returning();
    outraLojaId = outra!.id;

    // vendas: 5 dias na semana de 02/11, 5 na de 09/11 e hoje; Cebola repete o dia 02
    const diasTomate = [
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-16',
    ];
    await db
      .insert(salesDaily)
      .values([
        ...diasTomate.map((d) => ({ storeId: lojaId, itemId: tomate, saleDate: d, quantity: 10 })),
        { storeId: lojaId, itemId: cebola, saleDate: '2026-11-02', quantity: 4 },
      ]);

    const sugerir = async (
      data: string,
      sentAt: string | null,
      linhas: Array<{
        itemId: number;
        action: 'order' | 'skip' | 'risk';
        response?: 'accepted' | 'adjusted' | 'ignored';
        responseReason?: 'price' | 'holiday';
        responseNote?: string;
        respondedAt?: string;
      }>,
    ) => {
      const [s] = await db
        .insert(suggestions)
        .values({
          storeId: lojaId,
          suggestionDate: data,
          status: sentAt ? 'sent' : 'draft',
          sentAt: sentAt ? new Date(sentAt) : null,
          channel: 'telegram',
        })
        .returning();
      await db.insert(suggestionItems).values(
        linhas.map(({ respondedAt, ...l }) => ({
          ...l,
          suggestionId: s!.id,
          suggestedQty: 10,
          forecastQty: 10,
          respondedAt: respondedAt ? new Date(respondedAt) : null,
        })),
      );
    };

    // 09: aceitou Tomate (20 min), ajustou Cebola por preço (30 min); Batata é skip
    await sugerir('2026-11-09', '2026-11-09T11:00:00Z', [
      {
        itemId: tomate,
        action: 'order',
        response: 'accepted',
        respondedAt: '2026-11-09T11:20:00Z',
      },
      {
        itemId: cebola,
        action: 'order',
        response: 'adjusted',
        responseReason: 'price',
        responseNote: 'caro demais',
        respondedAt: '2026-11-09T11:30:00Z',
      },
      { itemId: batata, action: 'skip' },
    ]);
    // 10: a rotina diária marcou ignorado, sem responded_at: o dono não respondeu
    await sugerir('2026-11-10', '2026-11-10T11:00:00Z', [
      { itemId: tomate, action: 'order', response: 'ignored' },
      { itemId: cebola, action: 'order' },
    ]);
    // 11: rascunho nunca enviado; não conta
    await sugerir('2026-11-11', null, [
      {
        itemId: tomate,
        action: 'order',
        response: 'accepted',
        respondedAt: '2026-11-11T11:00:00Z',
      },
    ]);
    // 12: respondeu depois de 4 horas, ajustou por feriado
    await sugerir('2026-11-12', '2026-11-12T11:00:00Z', [
      {
        itemId: tomate,
        action: 'order',
        response: 'adjusted',
        responseReason: 'holiday',
        respondedAt: '2026-11-12T15:00:00Z',
      },
    ]);
    // 13: sem nenhuma resposta
    await sugerir('2026-11-13', '2026-11-13T11:00:00Z', [{ itemId: alface, action: 'order' }]);

    await db.insert(losses).values([
      // baseline (02–08)
      { storeId: lojaId, itemId: tomate, lossDate: '2026-11-03', quantity: 4, estValue: 20 },
      { storeId: lojaId, itemId: tomate, lossDate: '2026-11-05', quantity: 2, estValue: 10 },
      { storeId: lojaId, itemId: alface, lossDate: '2026-11-04', quantity: 3, estValue: 9 },
      // durante (09–16 = 8 dias)
      { storeId: lojaId, itemId: tomate, lossDate: '2026-11-10', quantity: 5, estValue: 25 },
      { storeId: lojaId, itemId: tomate, lossDate: '2026-11-14', quantity: 5, estValue: 25 },
      { storeId: lojaId, itemId: cebola, lossDate: '2026-11-12', quantity: 2, estValue: 6 },
    ]);
    await db.insert(stockouts).values([
      { storeId: lojaId, itemId: tomate, reportedDate: '2026-11-04' },
      { storeId: lojaId, itemId: tomate, reportedDate: '2026-11-10' },
      { storeId: lojaId, itemId: cebola, reportedDate: '2026-11-11' },
    ]);
  });
  afterAll(() => banco.descartar());

  it('calcula o DTO inteiro, com antes × durante', async () => {
    const metricas = metricasLojaSchema.parse(await servico.daLoja(lojaId, {}));
    expect(metricas).toEqual({
      loja: { id: lojaId, nome: 'Hortifruti Bom Preço (fictícia)', canal: 'manual' },
      periodo: { inicio: '2026-11-02', fim: '2026-11-16' },
      inicioSugestoes: '2026-11-09',
      adesao: {
        diasComSugestaoEnviada: 4,
        diasRespondidos: 2,
        percentualDiasRespondidos: 50,
        itens: { total: 6, aceitos: 1, ajustados: 2, ignorados: 1, semResposta: 2 },
        percentualAceitosOuAjustados: 50,
      },
      tempoResposta: { respostas: 2, medianaMinutos: 130, percentualAte2h: 50 },
      arquivos: [
        { semana: '2026-11-02', diasComVendas: 5, diasNoPeriodo: 7 },
        { semana: '2026-11-09', diasComVendas: 5, diasNoPeriodo: 7 },
        { semana: '2026-11-16', diasComVendas: 1, diasNoPeriodo: 1 },
      ],
      perdas: {
        semanas: [
          { semana: '2026-11-02', kg: 6, valor: 39, registros: 3 },
          { semana: '2026-11-09', kg: 12, valor: 56, registros: 3 },
          { semana: '2026-11-16', kg: 0, valor: 0, registros: 0 },
        ],
        porItem: [
          {
            itemId: idDoItem('Alface crespa'),
            itemNome: 'Alface crespa',
            unidade: 'un',
            antesPorSemana: { quantidade: 3, valor: 9 },
            durantePorSemana: { quantidade: 0, valor: 0 },
          },
          {
            itemId: idDoItem('Cebola'),
            itemNome: 'Cebola',
            unidade: 'kg',
            antesPorSemana: { quantidade: 0, valor: 0 },
            durantePorSemana: { quantidade: 1.75, valor: 5.25 },
          },
          {
            itemId: idDoItem('Tomate'),
            itemNome: 'Tomate',
            unidade: 'kg',
            antesPorSemana: { quantidade: 6, valor: 30 },
            durantePorSemana: { quantidade: 8.75, valor: 43.75 },
          },
        ],
      },
      rupturas: [
        { semana: '2026-11-02', quantidade: 1 },
        { semana: '2026-11-09', quantidade: 2 },
        { semana: '2026-11-16', quantidade: 0 },
      ],
      motivosAjuste: [
        { motivo: 'price', quantidade: 1 },
        { motivo: 'holiday', quantidade: 1 },
      ],
      notasAjuste: [{ data: '2026-11-09', itemNome: 'Cebola', nota: 'caro demais' }],
    });
  });

  it('respeita o período, mas inicioSugestoes vem de todo o histórico', async () => {
    const metricas = await servico.daLoja(lojaId, { from: '2026-11-10', to: '2026-11-16' });
    expect(metricas.periodo).toEqual({ inicio: '2026-11-10', fim: '2026-11-16' });
    expect(metricas.inicioSugestoes).toBe('2026-11-09');
    expect(metricas.adesao.diasComSugestaoEnviada).toBe(3);
    expect(metricas.adesao.diasRespondidos).toBe(1);
    expect(metricas.notasAjuste).toEqual([]);
    expect(metricas.arquivos).toEqual([
      { semana: '2026-11-09', diasComVendas: 4, diasNoPeriodo: 6 },
      { semana: '2026-11-16', diasComVendas: 1, diasNoPeriodo: 1 },
    ]);
    // a janela "durante" vai de 09/11 até o fim do período, independente do início do filtro
    const tomate = metricas.perdas.porItem.find((i) => i.itemNome === 'Tomate');
    expect(tomate?.antesPorSemana).toEqual({ quantidade: 6, valor: 30 });
    expect(tomate?.durantePorSemana).toEqual({ quantidade: 8.75, valor: 43.75 });
  });

  it('loja sem dados: período padrão de 28 dias e tudo zerado', async () => {
    const metricas = metricasLojaSchema.parse(await servico.daLoja(outraLojaId, {}));
    expect(metricas.periodo).toEqual({ inicio: '2026-10-20', fim: '2026-11-16' });
    expect(metricas.inicioSugestoes).toBeNull();
    expect(metricas.adesao.percentualDiasRespondidos).toBeNull();
    expect(metricas.tempoResposta).toEqual({
      respostas: 0,
      medianaMinutos: null,
      percentualAte2h: null,
    });
    expect(metricas.perdas.porItem).toEqual([]);
    expect(metricas.arquivos).toHaveLength(5);
  });

  it('404 para loja inexistente e 400 para período invertido', async () => {
    await expect(servico.daLoja(9999, {})).rejects.toMatchObject({ status: 404 });
    await expect(
      servico.daLoja(lojaId, { from: '2026-11-10', to: '2026-11-01' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('canais: dias com sugestão e respondidos por loja, em todo o histórico', async () => {
    const canais = metricasCanaisSchema.parse(await servico.canais());
    expect(canais).toEqual([
      {
        lojaId,
        nome: 'Hortifruti Bom Preço (fictícia)',
        canal: 'manual',
        telegramVinculado: false,
        diasComSugestaoEnviada: 4,
        percentualDiasRespondidos: 50,
      },
      {
        lojaId: outraLojaId,
        nome: 'Sem dados',
        canal: 'telegram',
        telegramVinculado: true,
        diasComSugestaoEnviada: 0,
        percentualDiasRespondidos: null,
      },
    ]);
  });
});
