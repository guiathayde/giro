import { z } from 'zod';

export const STATUS_BOT = ['ativo', 'desativado', 'erro'] as const;
export type StatusBot = (typeof STATUS_BOT)[number];

export const healthSchema = z.object({
  status: z.enum(['ok', 'erro']),
  db: z.enum(['ok', 'erro']),
  bot: z.enum(STATUS_BOT),
});
export type Health = z.infer<typeof healthSchema>;
