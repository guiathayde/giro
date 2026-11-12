import { z } from 'zod';
import { importacaoSchema } from './importacoes';

export const mensagemInboxSchema = z.object({
  id: z.number().int(),
  lojaId: z.number().int().nullable(),
  lojaNome: z.string().nullable(),
  chatId: z.number(),
  texto: z.string(),
  criadoEm: z.string(),
  resolvidoEm: z.string().nullable(),
});
export type MensagemInbox = z.infer<typeof mensagemInboxSchema>;

/** GET /inbox */
export const inboxSchema = z.object({
  mensagens: z.array(mensagemInboxSchema),
  /** últimos arquivos recebidos pelo bot (origem telegram), de todas as lojas */
  arquivos: z.array(importacaoSchema),
});
export type Inbox = z.infer<typeof inboxSchema>;

export const filtroInboxSchema = z.object({
  status: z.enum(['abertas', 'todas']).default('abertas'),
});
