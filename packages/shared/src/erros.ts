import { z } from 'zod';

export const erroApiSchema = z.object({
  erro: z.string(),
  detalhes: z.unknown().optional(),
});
export type ErroApi = z.infer<typeof erroApiSchema>;
