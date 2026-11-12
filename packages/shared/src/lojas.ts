import { z } from 'zod';
import { CANAIS, UNIDADES } from './enums';

/** Nome das colunas no arquivo do PDV da loja, quando a detecção automática não acerta. */
export const mapeamentoColunasSchema = z.object({
  descricao: z.string().trim().min(1),
  quantidade: z.string().trim().min(1),
  data: z.string().trim().min(1).nullish(),
  valor: z.string().trim().min(1).nullish(),
  codigo: z.string().trim().min(1).nullish(),
});
export type MapeamentoColunas = z.infer<typeof mapeamentoColunasSchema>;

export const lojaSchema = z.object({
  id: z.number().int(),
  nome: z.string(),
  nomeDono: z.string(),
  canal: z.enum(CANAIS),
  telegramVinculado: z.boolean(),
  mapeamentoColunas: mapeamentoColunasSchema.nullable(),
});
export type Loja = z.infer<typeof lojaSchema>;

export const itemSchema = z.object({
  id: z.number().int(),
  nome: z.string(),
  unidade: z.enum(UNIDADES),
  vidaUtilDias: z.number().int(),
  ativo: z.boolean(),
  aliases: z.array(z.string()),
});
export type Item = z.infer<typeof itemSchema>;

export const linkTelegramSchema = z.object({
  codigo: z.string(),
  /** null quando o bot não está ativo (sem token ou fora do ar) */
  link: z.string().nullable(),
});
export type LinkTelegram = z.infer<typeof linkTelegramSchema>;
