import { sql } from 'drizzle-orm';
import { Api } from 'grammy';
import { criarServidor } from './app';
import { criarDb } from './db/client';
import { lerEnv } from './env';
import { agendarRotinaDiaria } from './jobs/daily-suggestions';
import { criarServicoCalendario } from './modules/calendario/service';
import { criarServicoImportacoes } from './modules/imports/service';
import { criarServicoInbox } from './modules/inbox/service';
import { ManualChannel } from './modules/messaging/manual-channel';
import { TelegramChannel } from './modules/messaging/telegram-channel';
import { criarServicoMetricas } from './modules/metricas/service';
import { criarServicoRegistros } from './modules/registros/service';
import { criarServicoRespostas } from './modules/respostas/service';
import { criarServicoLojas } from './modules/stores/service';
import { criarServicoSugestoes } from './modules/suggestions/service';
import { iniciarBotTelegram } from './modules/telegram';
import { criarServicoSessoes } from './modules/telegram/sessoes';

const env = lerEnv();
const { db, pool } = criarDb(env.DATABASE_URL);

const servicos = {
  lojas: criarServicoLojas(db),
  importacoes: criarServicoImportacoes(db),
  sugestoes: criarServicoSugestoes(db, {
    canais: {
      // envio usa só a API HTTP do bot; funciona mesmo com o polling desligado
      telegram: env.TELEGRAM_BOT_TOKEN
        ? new TelegramChannel(new Api(env.TELEGRAM_BOT_TOKEN))
        : null,
      manual: new ManualChannel(),
    },
  }),
  respostas: criarServicoRespostas(db),
  registros: criarServicoRegistros(db),
  inbox: criarServicoInbox(db),
  calendario: criarServicoCalendario(db),
  metricas: criarServicoMetricas(db),
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
  apiToken: env.API_TOKEN,
  servicos,
});

if (!env.API_TOKEN) app.log.warn('API_TOKEN ausente: rotas da API sem autenticação');

const botTelegram = iniciarBotTelegram({
  token: env.TELEGRAM_BOT_TOKEN,
  polling: env.TELEGRAM_POLLING,
  log: app.log,
  servicos: { ...servicos, sessoes: criarServicoSessoes(db) },
});

const rotina = env.JOBS_ENABLED
  ? agendarRotinaDiaria({
      expressao: env.SUGGESTION_CRON,
      fuso: env.JOBS_TIMEZONE,
      executar: () => servicos.sugestoes.executarRotinaDiaria(),
      log: app.log,
    })
  : null;
if (!rotina) app.log.info('JOBS_ENABLED=false: rotina diária de sugestões desligada');

async function encerrar(sinal: string) {
  app.log.info(`${sinal} recebido, encerrando`);
  rotina?.parar();
  await botTelegram.parar();
  await app.close();
  await pool.end();
  process.exit(0);
}
process.once('SIGINT', () => void encerrar('SIGINT'));
process.once('SIGTERM', () => void encerrar('SIGTERM'));

await app.listen({ host: env.HOST, port: env.PORT });
