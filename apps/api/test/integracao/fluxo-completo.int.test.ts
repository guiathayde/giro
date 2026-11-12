// Ponta a ponta entre módulos: vendas → sugestão → envio → resposta do dono → estoque do dia
// seguinte → expiração → métricas. Pega desencontro de regra entre serviços feitos em separado.
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { purchases, stockCounts, stores } from '../../src/db/schema';
import { criarServicoImportacoes } from '../../src/modules/imports/service';
import { ManualChannel } from '../../src/modules/messaging/manual-channel';
import { criarServicoMetricas } from '../../src/modules/metricas/service';
import { criarServicoRespostas } from '../../src/modules/respostas/service';
import { criarServicoSugestoes } from '../../src/modules/suggestions/service';
import { ARQUIVO_28_DIAS_CSV, lerFixture } from '../imports/fixtures';
import { criarBancoDeTeste, semearLoja, type BancoDeTeste } from './banco';

describe('fluxo completo do piloto', () => {
  let banco: BancoDeTeste;
  let lojaId: number;
  let idDoItem: (nome: string) => number;
  let relogio = new Date('2026-11-09T08:30:00Z'); // 05:30 em São Paulo
  const agora = () => relogio;

  let sugestoes: ReturnType<typeof criarServicoSugestoes>;
  let respostas: ReturnType<typeof criarServicoRespostas>;
  let metricas: ReturnType<typeof criarServicoMetricas>;

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    ({ lojaId, idDoItem } = await semearLoja(banco.db));
    await criarServicoImportacoes(banco.db).importar({
      lojaId,
      origem: 'pdv_csv',
      nomeArquivo: ARQUIVO_28_DIAS_CSV,
      conteudo: lerFixture(ARQUIVO_28_DIAS_CSV),
    });
    // contagem de tomate no fim do dia 08/11 (21h em São Paulo)
    await banco.db.insert(stockCounts).values({
      storeId: lojaId,
      itemId: idDoItem('Tomate'),
      countedAt: new Date('2026-11-09T00:00:00Z'),
      quantity: 10,
      source: 'operator',
    });
    sugestoes = criarServicoSugestoes(banco.db, {
      canais: { telegram: null, manual: new ManualChannel() },
      agora,
    });
    respostas = criarServicoRespostas(banco.db, { agora });
    metricas = criarServicoMetricas(banco.db, { agora });
  });
  afterAll(() => banco.descartar());

  it('gera a sugestão do dia uma vez só (idempotente) com pedidos numerados', async () => {
    const s1 = await sugestoes.gerar(lojaId, {});
    const s2 = await sugestoes.gerar(lojaId, { data: '2026-11-09' });
    expect(s2.id).toBe(s1.id);
    expect(s1.data).toBe('2026-11-09');
    expect(s1.itens).toHaveLength(20);
    const posicoes = s1.itens.filter((i) => i.acao === 'order').map((i) => i.posicao);
    expect(posicoes).toEqual(posicoes.map((_, i) => i + 1));
    expect(s1.mensagem).toMatch(/^Bom dia, Seu Antônio! Sugestão de hoje \(seg 09\/11\):/);
    // canal manual: termina com a instrução de resposta para o WhatsApp
    expect(s1.mensagem).toMatch(/Responda \*ok\* para aceitar/);
  });

  it('envia, o dono ajusta o pedido 1 meia hora depois e o resto fica aceito', async () => {
    const s = await sugestoes.gerar(lojaId, {});
    const enviada = await sugestoes.enviar(s.id);
    expect(enviada.status).toBe('sent');
    expect(enviada.enviadaEm).toBe('2026-11-09T08:30:00.000Z');

    relogio = new Date('2026-11-09T09:00:00Z');
    const { aplicados, posicoesInvalidas } = await respostas.ajustar(s.id, [
      { posicao: 1, quantidade: 7 },
      { posicao: 99, quantidade: 1 },
    ]);
    expect(posicoesInvalidas).toEqual([99]);
    expect(aplicados).toHaveLength(1);
    await respostas.definirMotivo(aplicados[0]!.id, 'price');

    const final = await sugestoes.buscarPorData(lojaId, '2026-11-09');
    expect(final.status).toBe('answered');
    const pedidos = final.itens.filter((i) => i.acao === 'order');
    expect(pedidos.filter((i) => i.resposta === 'adjusted')).toHaveLength(1);
    expect(pedidos.every((i) => i.resposta !== null)).toBe(true);
  });

  it('a compra aceita entra no estoque estimado do dia seguinte', async () => {
    const s = await sugestoes.buscarPorData(lojaId, '2026-11-09');
    const tomate = s.itens.find((i) => i.itemId === idDoItem('Tomate'))!;
    const [compra] = await banco.db
      .select()
      .from(purchases)
      .where(eq(purchases.suggestionItemId, tomate.id));
    const comprado = compra?.quantity ?? 0;

    relogio = new Date('2026-11-10T08:30:00Z');
    const amanha = await sugestoes.gerar(lojaId, {});
    expect(amanha.data).toBe('2026-11-10');
    const tomateAmanha = amanha.itens.find((i) => i.itemId === idDoItem('Tomate'))!;
    // contagem de 08/11 (10 kg) + compra de 09/11; sem vendas importadas depois da contagem
    expect(tomateAmanha.estoqueEstimado).toBe(Math.round((10 + comprado) * 1000) / 1000);
    expect(tomateAmanha.estimativaFraca).toBe(false);
  });

  it('sugestão enviada e não respondida expira sem contar como resposta do dono', async () => {
    const s10 = await sugestoes.gerar(lojaId, {});
    await sugestoes.enviar(s10.id);

    relogio = new Date('2026-11-11T08:30:00Z');
    const resumo = await sugestoes.executarRotinaDiaria();
    expect(resumo).toMatchObject({ lojas: 1, geradas: 1, enviadas: 0, expiradas: 1, erros: [] });

    const expirada = await sugestoes.buscarPorData(lojaId, '2026-11-10');
    expect(expirada.status).toBe('expired');
    expect(expirada.itens.every((i) => i.resposta === 'ignored' && i.respondidoEm === null)).toBe(
      true,
    );
  });

  it('métricas: 2 dias enviados, 1 respondido em 30 min, motivo de ajuste registrado', async () => {
    const m = await metricas.daLoja(lojaId, { from: '2026-11-09', to: '2026-11-10' });
    expect(m.inicioSugestoes).toBe('2026-11-09');
    expect(m.adesao.diasComSugestaoEnviada).toBe(2);
    expect(m.adesao.diasRespondidos).toBe(1);
    expect(m.adesao.percentualDiasRespondidos).toBe(50);
    expect(m.tempoResposta).toMatchObject({
      respostas: 1,
      medianaMinutos: 30,
      percentualAte2h: 100,
    });
    expect(m.motivosAjuste).toEqual([{ motivo: 'price', quantidade: 1 }]);
    expect(m.adesao.itens.ajustados).toBe(1);
    expect(m.adesao.itens.ignorados).toBeGreaterThan(0);
  });

  it('envio automático só para loja telegram vinculada; manual nunca envia sozinha', async () => {
    await banco.db.update(stores).set({ autoSend: true }).where(eq(stores.id, lojaId));
    relogio = new Date('2026-11-12T08:30:00Z');
    const resumo = await sugestoes.executarRotinaDiaria();
    expect(resumo.enviadas).toBe(0);
    const hoje = await sugestoes.buscarPorData(lojaId, '2026-11-12');
    expect(hoje.status).toBe('draft');
    const [loja] = await banco.db
      .select()
      .from(stores)
      .where(and(eq(stores.id, lojaId)));
    expect(loja?.channel).toBe('manual');
  });
});
