import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3333),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  TELEGRAM_BOT_TOKEN: z
    .string()
    .trim()
    .optional()
    .transform((valor) => valor || undefined),
  TELEGRAM_POLLING: z.stringbool().default(true),
  /** token estático exigido em todas as rotas, menos /health (seção 6). Vazio = sem autenticação */
  API_TOKEN: z
    .string()
    .trim()
    .optional()
    .transform((valor) => valor || undefined),
  /** job diário de sugestões (gera, expira e envia). Desligado por padrão */
  JOBS_ENABLED: z.stringbool().default(false),
  SUGGESTION_CRON: z.string().default('30 5 * * *'),
  JOBS_TIMEZONE: z.string().default('America/Sao_Paulo'),
});

export type Env = z.infer<typeof envSchema>;

export function lerEnv(fonte: NodeJS.ProcessEnv = process.env): Env {
  const resultado = envSchema.safeParse(fonte);
  if (!resultado.success) {
    throw new Error(`Variáveis de ambiente inválidas:\n${z.prettifyError(resultado.error)}`);
  }
  return resultado.data;
}
