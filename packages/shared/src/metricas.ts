// Métricas do piloto (seção 1 do plano) — fase 4.
// Percentuais vão de 0 a 100. "Semana" é a segunda-feira que abre a semana (AAAA-MM-DD).
import { z } from 'zod';
import { dataIsoSchema } from './comum';
import { CANAIS, MOTIVOS_RESPOSTA, UNIDADES } from './enums';

const percentual = z.number().min(0).max(100).nullable();
const semana = dataIsoSchema;

const porSemana = z.object({ quantidade: z.number(), valor: z.number() });

/** GET /stores/:id/metrics?from&to */
export const metricasLojaSchema = z.object({
  loja: z.object({ id: z.number().int(), nome: z.string(), canal: z.enum(CANAIS) }),
  periodo: z.object({ inicio: dataIsoSchema, fim: dataIsoSchema }),
  /** primeiro dia com sugestão enviada; antes dele é a baseline ("antes") */
  inicioSugestoes: dataIsoSchema.nullable(),
  adesao: z.object({
    diasComSugestaoEnviada: z.number().int(),
    /** dias em que o dono respondeu pelo menos um item */
    diasRespondidos: z.number().int(),
    percentualDiasRespondidos: percentual,
    /** só itens de pedido (acao = order) das sugestões enviadas */
    itens: z.object({
      total: z.number().int(),
      aceitos: z.number().int(),
      ajustados: z.number().int(),
      ignorados: z.number().int(),
      semResposta: z.number().int(),
    }),
    percentualAceitosOuAjustados: percentual,
  }),
  tempoResposta: z.object({
    /** sugestões enviadas que tiveram resposta */
    respostas: z.number().int(),
    /** do envio até o primeiro item respondido */
    medianaMinutos: z.number().nullable(),
    percentualAte2h: percentual,
  }),
  /** dias com vendas importadas por semana (meta: ≥ 5) */
  arquivos: z.array(
    z.object({ semana, diasComVendas: z.number().int(), diasNoPeriodo: z.number().int() }),
  ),
  perdas: z.object({
    /** kg soma só itens vendidos em kg; valor (R$) soma todos */
    semanas: z.array(
      z.object({ semana, kg: z.number(), valor: z.number(), registros: z.number().int() }),
    ),
    /**
     * Média semanal por item. "antes" = primeira semana de dados (7 dias a partir da primeira
     * venda importada), só se terminar antes do inicioSugestoes; "durante" = do inicioSugestoes
     * até o fim do período.
     */
    porItem: z.array(
      z.object({
        itemId: z.number().int(),
        itemNome: z.string(),
        unidade: z.enum(UNIDADES),
        antesPorSemana: porSemana.nullable(),
        durantePorSemana: porSemana.nullable(),
      }),
    ),
  }),
  rupturas: z.array(z.object({ semana, quantidade: z.number().int() })),
  motivosAjuste: z.array(
    z.object({ motivo: z.enum(MOTIVOS_RESPOSTA), quantidade: z.number().int() }),
  ),
  notasAjuste: z.array(z.object({ data: dataIsoSchema, itemNome: z.string(), nota: z.string() })),
});
export type MetricasLoja = z.infer<typeof metricasLojaSchema>;

/** GET /metrics/channels — hipótese "o dono aceita usar Telegram" */
export const metricasCanaisSchema = z.array(
  z.object({
    lojaId: z.number().int(),
    nome: z.string(),
    canal: z.enum(CANAIS),
    telegramVinculado: z.boolean(),
    diasComSugestaoEnviada: z.number().int(),
    percentualDiasRespondidos: percentual,
  }),
);
export type MetricasCanais = z.infer<typeof metricasCanaisSchema>;
