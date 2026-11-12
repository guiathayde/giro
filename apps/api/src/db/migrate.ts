import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { lerEnv } from '../env';
import { criarDb } from './client';

const { db, pool } = criarDb(lerEnv().DATABASE_URL);

try {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('./migrations', import.meta.url)) });
  console.log('migrations aplicadas');
} finally {
  await pool.end();
}
