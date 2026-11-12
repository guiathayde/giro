// Sugestões: gerar (motor + mensagem), buscar, enviar pelo canal da loja, painel "Hoje" e rotina diária.
import type { Canal, GerarSugestao, PainelHoje, Sugestao } from '@giro/shared';
import { and, asc, count, eq, inArray, isNull, lt, max, gt, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import {
  inboxMessages,
  salesDaily,
  salesImports,
  stores,
  suggestionItems,
  suggestions,
} from '../../db/schema';
import { hojeNoFuso } from '../../datas';
import { ErroHttp, naoEncontrado, requisicaoInvalida } from '../../erros';
import type { MessagingChannel } from '../messaging/canal';
import { lojaParaDto } from '../stores/service';
import { carregarSugestao, carregarSugestaoPorData } from './dto';
import { montarEntradaMotor } from './entrada';
import { calcularSugestoes } from './engine';
import { gerarMensagem, ordenarParaMensagem } from './mensagem';

export interface DependenciasSugestoes {
  /** telegram é null quando não há token do bot */
  canais: Record<Canal, MessagingChannel | null>;
  /** relógio injetável (testes) */
  agora?: () => Date;
}

export interface ResumoRotinaDiaria {
  lojas: number;
  geradas: number;
  enviadas: number;
  expiradas: number;
  erros: { lojaId: number; erro: string }[];
}

const FUSO_PAINEL = 'America/Sao_Paulo';

function violacaoUnica(err: unknown): boolean {
  let atual: unknown = err;
  for (let i = 0; i < 5 && atual && typeof atual === 'object'; i++) {
    if ((atual as { code?: unknown }).code === '23505') return true;
    atual = (atual as { cause?: unknown }).cause;
  }
  return false;
}

/** tira o token do bot de mensagens de erro antes de mostrar ao operador */
function semToken(mensagem: string): string {
  return mensagem.replace(/(bot)?\d{6,}:[A-Za-z0-9_-]{20,}/g, '***');
}

export function criarServicoSugestoes(db: Db, deps: DependenciasSugestoes) {
  const agora = deps.agora ?? (() => new Date());

  async function buscarLoja(lojaId: number) {
    const [loja] = await db.select().from(stores).where(eq(stores.id, lojaId));
    if (!loja) throw naoEncontrado('Loja não encontrada');
    return loja;
  }

  /** roda o motor e monta os itens e o texto; só lê do banco */
  async function calcular(loja: typeof stores.$inferSelect, data: string) {
    const { entrada, nomes } = await montarEntradaMotor(db, loja, data);
    const resultados = calcularSugestoes(entrada).map((r) => {
      const info = nomes.get(r.itemId);
      return { ...r, nome: info?.nome ?? '', unidade: info?.unidade ?? ('un' as const) };
    });
    const ordenados = ordenarParaMensagem(resultados);
    const mensagem = gerarMensagem({
      nomeDono: loja.ownerName,
      data,
      canal: loja.channel,
      itens: ordenados,
    });
    return { ordenados, mensagem };
  }

  type Calculo = Awaited<ReturnType<typeof calcular>>;

  function linhasDeItens(sugestaoId: number, calculo: Calculo) {
    return calculo.ordenados.map((i) => ({
      suggestionId: sugestaoId,
      itemId: i.itemId,
      action: i.acao,
      position: i.posicao,
      weakEstimate: i.estimativaFraca,
      suggestedQty: i.quantidadeSugerida,
      forecastQty: i.previsao,
      estimatedStock: i.estoqueEstimado,
      daysOfCover: i.diasCobertura,
      reason: i.motivo,
    }));
  }

  async function gerar(lojaId: number, opcoes: GerarSugestao): Promise<Sugestao> {
    const loja = await buscarLoja(lojaId);
    const data = opcoes.data ?? hojeNoFuso(loja.timezone, agora());

    const [existente] = await db
      .select()
      .from(suggestions)
      .where(and(eq(suggestions.storeId, lojaId), eq(suggestions.suggestionDate, data)));
    if (existente && !(opcoes.refazer && existente.status === 'draft')) {
      return carregarSugestao(db, existente.id);
    }

    const calculo = await calcular(loja, data);

    if (existente) {
      // refazer rascunho: mesmo id, itens novos
      await db.transaction(async (tx) => {
        const [atual] = await tx
          .select({ status: suggestions.status, sentAt: suggestions.sentAt })
          .from(suggestions)
          .where(eq(suggestions.id, existente.id))
          .for('update');
        if (!atual || atual.status !== 'draft' || atual.sentAt) return;
        await tx.delete(suggestionItems).where(eq(suggestionItems.suggestionId, existente.id));
        await tx
          .update(suggestions)
          .set({ messageText: calculo.mensagem, channel: loja.channel, generatedAt: agora() })
          .where(eq(suggestions.id, existente.id));
        if (calculo.ordenados.length > 0) {
          await tx.insert(suggestionItems).values(linhasDeItens(existente.id, calculo));
        }
      });
      return carregarSugestao(db, existente.id);
    }

    try {
      const id = await db.transaction(async (tx) => {
        const [criada] = await tx
          .insert(suggestions)
          .values({
            storeId: lojaId,
            suggestionDate: data,
            status: 'draft',
            channel: loja.channel,
            messageText: calculo.mensagem,
            generatedAt: agora(),
          })
          .returning({ id: suggestions.id });
        if (!criada) throw new Error('falha ao criar sugestão');
        if (calculo.ordenados.length > 0) {
          await tx.insert(suggestionItems).values(linhasDeItens(criada.id, calculo));
        }
        return criada.id;
      });
      return await carregarSugestao(db, id);
    } catch (err) {
      if (!violacaoUnica(err)) throw err;
      const outra = await carregarSugestaoPorData(db, lojaId, data);
      if (!outra) throw err;
      return outra;
    }
  }

  async function buscarPorData(lojaId: number, data: string): Promise<Sugestao> {
    const sugestao = await carregarSugestaoPorData(db, lojaId, data);
    if (!sugestao) throw naoEncontrado('Sugestão não encontrada para essa data');
    return sugestao;
  }

  async function desfazerReserva(sugestaoId: number) {
    await db
      .update(suggestions)
      .set({ sentAt: null, status: 'draft' })
      .where(eq(suggestions.id, sugestaoId));
  }

  async function enviar(sugestaoId: number): Promise<Sugestao> {
    let [sugestao] = await db.select().from(suggestions).where(eq(suggestions.id, sugestaoId));
    if (!sugestao) throw naoEncontrado('Sugestão não encontrada');
    if (sugestao.sentAt) return carregarSugestao(db, sugestaoId);

    const loja = await buscarLoja(sugestao.storeId);
    if (loja.channel !== sugestao.channel && sugestao.status === 'draft') {
      // o texto depende do canal (manual tem a linha "Responda ok…")
      await gerar(loja.id, { data: sugestao.suggestionDate, refazer: true });
      [sugestao] = await db.select().from(suggestions).where(eq(suggestions.id, sugestaoId));
      if (!sugestao) throw naoEncontrado('Sugestão não encontrada');
    }

    const canal = deps.canais[sugestao.channel];
    if (sugestao.channel === 'telegram') {
      if (!canal) throw requisicaoInvalida('Bot do Telegram desativado');
      if (loja.telegramChatId === null) throw requisicaoInvalida('Loja sem Telegram vinculado');
    }
    if (!canal) throw requisicaoInvalida('Canal de envio indisponível');

    // reserva atômica: só um processo passa daqui
    const reservada = await db
      .update(suggestions)
      .set({ sentAt: sql`now()`, status: 'sent' })
      .where(and(eq(suggestions.id, sugestaoId), isNull(suggestions.sentAt)))
      .returning({ id: suggestions.id });
    if (reservada.length === 0) return carregarSugestao(db, sugestaoId);

    try {
      const resultado = await canal.enviarSugestao({
        sugestaoId,
        texto: sugestao.messageText ?? '',
        destino: {
          lojaId: loja.id,
          telegramChatId: loja.telegramChatId,
          whatsapp: loja.whatsappPhone,
        },
      });
      if (resultado.telegramMessageId !== null) {
        await db
          .update(suggestions)
          .set({ telegramMessageId: resultado.telegramMessageId })
          .where(eq(suggestions.id, sugestaoId));
      }
    } catch (err) {
      await desfazerReserva(sugestaoId);
      const motivo = semToken(err instanceof Error ? err.message : String(err));
      const nomeCanal = sugestao.channel === 'telegram' ? 'Telegram' : 'canal manual';
      throw new ErroHttp(502, `Falha ao enviar pelo ${nomeCanal}: ${motivo}`);
    }
    return carregarSugestao(db, sugestaoId);
  }

  async function painelHoje(data?: string): Promise<PainelHoje> {
    const dia = data ?? hojeNoFuso(FUSO_PAINEL, agora());
    const lojas = await db.select().from(stores).orderBy(asc(stores.name), asc(stores.id));

    const linhas = [];
    for (const loja of lojas) {
      const sugestao = await carregarSugestaoPorData(db, loja.id, dia);
      const [pendentes] = await db
        .select({ total: count() })
        .from(salesImports)
        .where(and(eq(salesImports.storeId, loja.id), gt(salesImports.rowsUnmatched, 0)));
      const [ultimo] = await db
        .select({ dia: max(salesDaily.saleDate) })
        .from(salesDaily)
        .where(eq(salesDaily.storeId, loja.id));
      linhas.push({
        loja: lojaParaDto(loja),
        sugestao,
        importacoesPendentes: pendentes?.total ?? 0,
        ultimoDiaComVendas: ultimo?.dia ?? null,
      });
    }
    const [inbox] = await db
      .select({ total: count() })
      .from(inboxMessages)
      .where(isNull(inboxMessages.resolvedAt));
    return { data: dia, lojas: linhas, inboxAbertas: inbox?.total ?? 0 };
  }

  async function expirarPendentes(lojaId: number, hoje: string): Promise<number> {
    return db.transaction(async (tx) => {
      const expiradas = await tx
        .update(suggestions)
        .set({ status: 'expired' })
        .where(
          and(
            eq(suggestions.storeId, lojaId),
            lt(suggestions.suggestionDate, hoje),
            eq(suggestions.status, 'sent'),
          ),
        )
        .returning({ id: suggestions.id });
      if (expiradas.length > 0) {
        // sem responded_at: a métrica distingue resposta do dono de expiração
        await tx
          .update(suggestionItems)
          .set({ response: 'ignored' })
          .where(
            and(
              inArray(
                suggestionItems.suggestionId,
                expiradas.map((s) => s.id),
              ),
              isNull(suggestionItems.response),
            ),
          );
      }
      return expiradas.length;
    });
  }

  async function executarRotinaDiaria(): Promise<ResumoRotinaDiaria> {
    const lojas = await db.select().from(stores).orderBy(asc(stores.id));
    const resumo: ResumoRotinaDiaria = {
      lojas: lojas.length,
      geradas: 0,
      enviadas: 0,
      expiradas: 0,
      erros: [],
    };
    for (const loja of lojas) {
      try {
        const hoje = hojeNoFuso(loja.timezone, agora());
        resumo.expiradas += await expirarPendentes(loja.id, hoje);
        const jaExistia = await carregarSugestaoPorData(db, loja.id, hoje);
        let sugestao = await gerar(loja.id, { data: hoje });
        if (!jaExistia) resumo.geradas += 1;
        if (
          loja.autoSend &&
          loja.channel === 'telegram' &&
          loja.telegramChatId !== null &&
          sugestao.enviadaEm === null
        ) {
          sugestao = await enviar(sugestao.id);
          resumo.enviadas += 1;
        }
      } catch (err) {
        resumo.erros.push({
          lojaId: loja.id,
          erro: semToken(err instanceof Error ? err.message : String(err)),
        });
      }
    }
    return resumo;
  }

  return {
    /** idempotente por (loja, data): devolve a existente; `refazer` só recalcula rascunho */
    gerar,
    /** 404 se não existe */
    buscarPorData,
    /** pelo canal da loja; telegram envia, manual só marca enviada. Não reenvia o que já foi */
    enviar,
    painelHoje,
    /** sugestões enviadas de dias anteriores sem resposta → expired; itens sem resposta → ignored */
    expirarPendentes,
    /** job das 05:30: por loja, expira, gera e envia se envioAutomatico */
    executarRotinaDiaria,
  };
}

export type ServicoSugestoes = ReturnType<typeof criarServicoSugestoes>;
