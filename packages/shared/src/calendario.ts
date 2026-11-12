import { z } from 'zod';
import { dataIsoSchema } from './comum';
import { TIPOS_EVENTO } from './enums';

export const eventoCalendarioSchema = z.object({
  id: z.number().int(),
  /** null = vale para todas as lojas (ex.: feriado nacional) */
  lojaId: z.number().int().nullable(),
  data: dataIsoSchema,
  tipo: z.enum(TIPOS_EVENTO),
  descricao: z.string(),
  /** multiplica a previsão de venda do dia (1 = sem efeito; 1.3 = vende 30% mais) */
  fatorDemanda: z.number(),
});
export type EventoCalendario = z.infer<typeof eventoCalendarioSchema>;

export const novoEventoSchema = z.object({
  lojaId: z.number().int().positive().nullable().default(null),
  data: dataIsoSchema,
  tipo: z.enum(TIPOS_EVENTO),
  descricao: z.string().trim().min(1).max(120),
  fatorDemanda: z.number().min(0).max(5).default(1),
});
export type NovoEvento = z.input<typeof novoEventoSchema>;
