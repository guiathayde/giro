import { z } from 'zod';
import { dataIsoSchema } from './comum';
import {
  ACOES_SUGESTAO,
  CANAIS,
  MOTIVOS_RESPOSTA,
  RESPOSTAS_SUGESTAO,
  STATUS_SUGESTAO,
  UNIDADES,
} from './enums';
import { lojaSchema } from './lojas';

export const itemSugestaoSchema = z.object({
  id: z.number().int(),
  itemId: z.number().int(),
  itemNome: z.string(),
  unidade: z.enum(UNIDADES),
  acao: z.enum(ACOES_SUGESTAO),
  /** número do pedido na mensagem; o dono ajusta com "N qtd". null para não repor/encalhe */
  posicao: z.number().int().nullable(),
  quantidadeSugerida: z.number(),
  /** venda prevista no horizonte (forecast_qty) */
  previsao: z.number(),
  estoqueEstimado: z.number().nullable(),
  diasCobertura: z.number().nullable(),
  /** estoque estimado sem contagem nos últimos 7 dias */
  estimativaFraca: z.boolean(),
  /** explicação curta para o dono ("tem ~15 kg, vende ~25 kg/dia") */
  motivo: z.string().nullable(),
  resposta: z.enum(RESPOSTAS_SUGESTAO).nullable(),
  quantidadeResposta: z.number().nullable(),
  motivoResposta: z.enum(MOTIVOS_RESPOSTA).nullable(),
  notaResposta: z.string().nullable(),
  respondidoEm: z.string().nullable(),
});
export type ItemSugestao = z.infer<typeof itemSugestaoSchema>;

export const sugestaoSchema = z.object({
  id: z.number().int(),
  lojaId: z.number().int(),
  data: dataIsoSchema,
  geradaEm: z.string(),
  status: z.enum(STATUS_SUGESTAO),
  canal: z.enum(CANAIS),
  /** texto pronto (seção 5.5 do plano); no canal manual, o operador copia para o WhatsApp */
  mensagem: z.string().nullable(),
  enviadaEm: z.string().nullable(),
  /** ordem: encalhe, pedidos por posição, não repor */
  itens: z.array(itemSugestaoSchema),
});
export type Sugestao = z.infer<typeof sugestaoSchema>;

/** POST /stores/:id/suggestions/run — idempotente por (loja, data); refazer só vale para rascunho */
export const gerarSugestaoSchema = z.object({
  data: dataIsoSchema.optional(),
  refazer: z.boolean().default(false),
});
export type GerarSugestao = z.input<typeof gerarSugestaoSchema>;

const motivoENota = {
  motivo: z.enum(MOTIVOS_RESPOSTA).nullish(),
  nota: z.string().trim().max(500).nullish(),
};

/** POST /suggestion-items/:id/response */
export const registrarRespostaSchema = z.discriminatedUnion('resposta', [
  z.object({ resposta: z.literal('accepted') }),
  z.object({
    resposta: z.literal('adjusted'),
    quantidade: z.number().nonnegative(),
    ...motivoENota,
  }),
  z.object({ resposta: z.literal('ignored'), ...motivoENota }),
]);
export type RegistrarResposta = z.infer<typeof registrarRespostaSchema>;

/** GET /today?date= — tela "Hoje" */
export const painelHojeSchema = z.object({
  data: dataIsoSchema,
  lojas: z.array(
    z.object({
      loja: lojaSchema,
      sugestao: sugestaoSchema.nullable(),
      /** importações com descrições ainda não mapeadas */
      importacoesPendentes: z.number().int(),
      /** último dia com vendas importadas; ajuda a ver "dias sem arquivo" */
      ultimoDiaComVendas: dataIsoSchema.nullable(),
    }),
  ),
  /** mensagens do bot não entendidas, ainda não resolvidas */
  inboxAbertas: z.number().int(),
});
export type PainelHoje = z.infer<typeof painelHojeSchema>;
