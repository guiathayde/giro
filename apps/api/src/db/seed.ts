// Seed de desenvolvimento: 1 loja fictícia + 20 itens de hortifruti.
// Idempotente: se a loja já existe, não faz nada.
import { eq } from 'drizzle-orm';
import { lerEnv } from '../env';
import { criarDb } from './client';
import { ITENS, LOJA } from './dados-seed';
import { items, stores } from './schema';

const { db, pool } = criarDb(lerEnv().DATABASE_URL);

try {
  const existente = await db.query.stores.findFirst({ where: eq(stores.name, LOJA.name) });

  if (existente) {
    console.log(`seed já aplicado (loja #${existente.id} "${existente.name}"), nada a fazer`);
  } else {
    await db.transaction(async (tx) => {
      const [loja] = await tx.insert(stores).values(LOJA).returning();
      if (!loja) throw new Error('falha ao criar a loja do seed');
      await tx.insert(items).values(ITENS.map((item) => ({ ...item, storeId: loja.id })));
      console.log(`seed aplicado: loja #${loja.id} "${loja.name}" com ${ITENS.length} itens`);
    });
  }
} finally {
  await pool.end();
}
