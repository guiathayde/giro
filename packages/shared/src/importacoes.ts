import { z } from 'zod';
import { ORIGENS_IMPORTACAO, STATUS_IMPORTACAO } from './enums';

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Colunas que o parser usou, com o nome como aparece no arquivo. */
export const colunasDetectadasSchema = z.object({
  descricao: z.string(),
  quantidade: z.string(),
  data: z.string().nullable(),
  valor: z.string().nullable(),
  codigo: z.string().nullable(),
});
export type ColunasDetectadas = z.infer<typeof colunasDetectadasSchema>;

export const importacaoSchema = z.object({
  id: z.number().int(),
  lojaId: z.number().int(),
  origem: z.enum(ORIGENS_IMPORTACAO),
  nomeArquivo: z.string().nullable(),
  inicioPeriodo: dataIso.nullable(),
  fimPeriodo: dataIso.nullable(),
  /** linhas de venda válidas no arquivo */
  linhasTotal: z.number().int(),
  linhasMapeadas: z.number().int(),
  /** linhas pendentes de mapeamento (não inclui as ignoradas) */
  linhasNaoMapeadas: z.number().int(),
  status: z.enum(STATUS_IMPORTACAO),
  erro: z.string().nullable(),
  criadoEm: z.string(),
});
export type Importacao = z.infer<typeof importacaoSchema>;

/** Descrição do PDV que ainda não foi associada a um item (fila "mapear"). */
export const naoMapeadoSchema = z.object({
  normalizada: z.string(),
  descricao: z.string(),
  codigo: z.string().nullable(),
  linhas: z.number().int(),
  quantidade: z.number(),
});
export type NaoMapeado = z.infer<typeof naoMapeadoSchema>;

export const resumoImportacaoSchema = z.object({
  importacao: importacaoSchema,
  colunas: colunasDetectadasSchema.nullable(),
  /** cabeçalhos achados no arquivo, para o operador escolher as colunas */
  cabecalhos: z.array(z.string()),
  naoMapeados: z.array(naoMapeadoSchema),
  descartadas: z.array(z.object({ motivo: z.string(), linhas: z.number().int() })),
});
export type ResumoImportacao = z.infer<typeof resumoImportacaoSchema>;

export const linhaPreviaSchema = z.object({
  data: dataIso,
  descricao: z.string(),
  quantidade: z.number(),
  valor: z.number().nullable(),
  linhas: z.number().int(),
  itemId: z.number().int().nullable(),
  itemNome: z.string().nullable(),
  ignorada: z.boolean(),
});
export type LinhaPrevia = z.infer<typeof linhaPreviaSchema>;

export const detalheImportacaoSchema = resumoImportacaoSchema.extend({
  previa: z.array(linhaPreviaSchema),
});
export type DetalheImportacao = z.infer<typeof detalheImportacaoSchema>;

export const mapearImportacaoSchema = z.object({
  mapeamentos: z
    .array(
      z.object({
        normalizada: z.string().min(1),
        /** null = não é item de hortifruti; ignorar nas próximas importações */
        itemId: z.number().int().positive().nullable(),
      }),
    )
    .min(1),
});
export type MapearImportacao = z.infer<typeof mapearImportacaoSchema>;
