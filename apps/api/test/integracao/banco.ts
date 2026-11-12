// Banco Postgres descartável para testes de integração (pnpm test:int).
// Precisa do Postgres no ar (docker compose up -d postgres). Nunca toca o banco "giro".
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { criarDb, type Db } from '../../src/db/client';
import { ITENS, LOJA } from '../../src/db/dados-seed';
import { items, stores } from '../../src/db/schema';

/** conexão de administração (banco "postgres"), só para criar e apagar os bancos de teste */
const URL_ADMIN = process.env.TEST_DATABASE_URL ?? 'postgres://giro:giro@localhost:5432/postgres';

export interface BancoDeTeste {
  db: Db;
  url: string;
  descartar: () => Promise<void>;
}

export async function criarBancoDeTeste(): Promise<BancoDeTeste> {
  const nome = `giro_teste_${process.pid}_${randomBytes(4).toString('hex')}`;
  const admin = new pg.Client({ connectionString: URL_ADMIN });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${nome}`);
  await admin.end();

  const url = new URL(URL_ADMIN);
  url.pathname = `/${nome}`;
  const { db, pool } = criarDb(url.toString());
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../src/db/migrations', import.meta.url)),
  });

  return {
    db,
    url: url.toString(),
    descartar: async () => {
      await pool.end();
      const c = new pg.Client({ connectionString: URL_ADMIN });
      await c.connect();
      await c.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`);
      await c.end();
    },
  };
}

/** loja fictícia do seed com os 20 itens; devolve ids */
export async function semearLoja(db: Db) {
  const [loja] = await db.insert(stores).values(LOJA).returning();
  if (!loja) throw new Error('falha ao criar loja');
  const criados = await db
    .insert(items)
    .values(ITENS.map((i) => ({ ...i, storeId: loja.id })))
    .returning({ id: items.id, name: items.name });
  const idDoItem = (nome: string) => {
    const item = criados.find((i) => i.name === nome);
    if (!item) throw new Error(`item ${nome} não existe`);
    return item.id;
  };
  return { lojaId: loja.id, idDoItem };
}
