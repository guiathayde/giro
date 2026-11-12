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
  /** só dígitos, com 55 + DDD (ex.: 5516991234567), pronto para wa.me */
  whatsapp: z.string().nullable(),
  canal: z.enum(CANAIS),
  telegramVinculado: z.boolean(),
  /** o job diário envia a sugestão sozinho (só lojas com canal telegram e chat vinculado) */
  envioAutomatico: z.boolean(),
  sistemaPdv: z.string().nullable(),
  fusoHorario: z.string(),
  mapeamentoColunas: mapeamentoColunasSchema.nullable(),
});
export type Loja = z.infer<typeof lojaSchema>;

const camposLoja = {
  nome: z.string().trim().min(1).max(120),
  nomeDono: z.string().trim().min(1).max(120),
  /** aceita 10–13 dígitos; sem o 55 na frente, o serviço acrescenta */
  whatsapp: z
    .string()
    .trim()
    .regex(/^\d{10,13}$/, 'Só números, com DDD (ex.: 16991234567)')
    .nullable(),
  canal: z.enum(CANAIS),
  sistemaPdv: z.string().trim().max(120).nullable(),
  fusoHorario: z.string().trim().min(1),
};

export const novaLojaSchema = z.object({
  nome: camposLoja.nome,
  nomeDono: camposLoja.nomeDono,
  whatsapp: camposLoja.whatsapp.default(null),
  canal: camposLoja.canal.default('manual'),
  sistemaPdv: camposLoja.sistemaPdv.default(null),
  fusoHorario: camposLoja.fusoHorario.default('America/Sao_Paulo'),
});
export type NovaLoja = z.input<typeof novaLojaSchema>;

/** PATCH: só os campos enviados mudam */
export const edicaoLojaSchema = z.object({ ...camposLoja, envioAutomatico: z.boolean() }).partial();
export type EdicaoLoja = z.infer<typeof edicaoLojaSchema>;

export const itemSchema = z.object({
  id: z.number().int(),
  lojaId: z.number().int(),
  nome: z.string(),
  unidade: z.enum(UNIDADES),
  vidaUtilDias: z.number().int(),
  custoMedio: z.number().nullable(),
  precoMedio: z.number().nullable(),
  /** múltiplo de arredondamento do pedido; null = padrão da unidade (un: 5, demais: 1) */
  multiploPedido: z.number().nullable(),
  ativo: z.boolean(),
  aliases: z.array(z.string()),
});
export type Item = z.infer<typeof itemSchema>;

const camposItem = {
  nome: z.string().trim().min(1).max(120),
  unidade: z.enum(UNIDADES),
  vidaUtilDias: z.number().int().min(1).max(60),
  custoMedio: z.number().nonnegative().nullable(),
  precoMedio: z.number().nonnegative().nullable(),
  multiploPedido: z.number().positive().nullable(),
  ativo: z.boolean(),
  aliases: z.array(z.string().trim().min(1).max(120)).max(50),
};

export const novoItemSchema = z.object({
  nome: camposItem.nome,
  unidade: camposItem.unidade,
  vidaUtilDias: camposItem.vidaUtilDias,
  custoMedio: camposItem.custoMedio.default(null),
  precoMedio: camposItem.precoMedio.default(null),
  multiploPedido: camposItem.multiploPedido.default(null),
  ativo: camposItem.ativo.default(true),
  aliases: camposItem.aliases.default([]),
});
export type NovoItem = z.input<typeof novoItemSchema>;

/** PATCH: só os campos enviados mudam */
export const edicaoItemSchema = z.object(camposItem).partial();
export type EdicaoItem = z.infer<typeof edicaoItemSchema>;

export const linkTelegramSchema = z.object({
  codigo: z.string(),
  /** null quando o bot não está ativo (sem token ou fora do ar) */
  link: z.string().nullable(),
});
export type LinkTelegram = z.infer<typeof linkTelegramSchema>;
