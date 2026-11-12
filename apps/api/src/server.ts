import { sql } from 'drizzle-orm';
import { criarServidor } from './app';
import { criarDb } from './db/client';
import { lerEnv } from './env';
import { criarServicoImportacoes } from './modules/imports/service';
import { criarServicoLojas } from './modules/stores/service';
import { iniciarBotTelegram } from './modules/telegram';

const env = lerEnv();
const { db, pool } = criarDb(env.DATABASE_URL);
const servicos = {
  lojas: criarServicoLojas(db),
  importacoes: criarServicoImportacoes(db),
};

const app = criarServidor({
  logger: {
    level: env.LOG_LEVEL,
    ...(env.NODE_ENV === 'development' && { transport: { target: 'pino-pretty' } }),
  },
  verificarBanco: async () => {
    await db.execute(sql`select 1`);
  },
  // /health e o link do bot só são chamados depois do listen, quando o bot já foi iniciado
  statusBot: () => botTelegram.status(),
  usernameBot: () => botTelegram.username(),
  servicos,
});

const botTelegram = iniciarBotTelegram({
  token: env.TELEGRAM_BOT_TOKEN,
  polling: env.TELEGRAM_POLLING,
  log: app.log,
  servicos,
});

async function encerrar(sinal: string) {
  app.log.info(`${sinal} recebido, encerrando`);
  await botTelegram.parar();
  await app.close();
  await pool.end();
  process.exit(0);
}
process.once('SIGINT', () => void encerrar('SIGINT'));
process.once('SIGTERM', () => void encerrar('SIGTERM'));

await app.listen({ host: env.HOST, port: env.PORT });
