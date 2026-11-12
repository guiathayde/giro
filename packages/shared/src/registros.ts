// Perdas (descarte), faltas (ruptura) e contagens de estoque — fase 3.
import { z } from 'zod';
import { dataIsoSchema } from './comum';
import { MOTIVOS_PERDA, ORIGENS_CONTAGEM, UNIDADES } from './enums';

export const perdaSchema = z.object({
  id: z.number().int(),
  lojaId: z.number().int(),
  itemId: z.number().int(),
  itemNome: z.string(),
  unidade: z.enum(UNIDADES),
  data: dataIsoSchema,
  quantidade: z.number(),
  /** quantidade × custo médio do item no momento do registro */
  valorEstimado: z.number().nullable(),
  motivo: z.enum(MOTIVOS_PERDA),
  nota: z.string().nullable(),
  criadoEm: z.string(),
});
export type Perda = z.infer<typeof perdaSchema>;

/** sem data = hoje no fuso da loja */
export const novaPerdaSchema = z.object({
  itemId: z.number().int().positive(),
  quantidade: z.number().positive(),
  data: dataIsoSchema.optional(),
  motivo: z.enum(MOTIVOS_PERDA).default('spoiled'),
  nota: z.string().trim().max(500).nullish(),
});
export type NovaPerda = z.input<typeof novaPerdaSchema>;

export const faltaSchema = z.object({
  id: z.number().int(),
  lojaId: z.number().int(),
  itemId: z.number().int(),
  itemNome: z.string(),
  data: dataIsoSchema,
  nota: z.string().nullable(),
});
export type Falta = z.infer<typeof faltaSchema>;

export const novaFaltaSchema = z.object({
  itemId: z.number().int().positive(),
  data: dataIsoSchema.optional(),
  nota: z.string().trim().max(500).nullish(),
});
export type NovaFalta = z.input<typeof novaFaltaSchema>;

export const contagemSchema = z.object({
  id: z.number().int(),
  lojaId: z.number().int(),
  itemId: z.number().int(),
  itemNome: z.string(),
  unidade: z.enum(UNIDADES),
  quantidade: z.number(),
  contadoEm: z.string(),
  origem: z.enum(ORIGENS_CONTAGEM),
});
export type Contagem = z.infer<typeof contagemSchema>;

export const novaContagemSchema = z.object({
  itemId: z.number().int().positive(),
  quantidade: z.number().nonnegative(),
  origem: z.enum(ORIGENS_CONTAGEM).default('operator'),
});
export type NovaContagem = z.input<typeof novaContagemSchema>;
