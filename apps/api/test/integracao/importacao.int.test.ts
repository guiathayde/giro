import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { items, salesDaily, stores } from '../../src/db/schema';
import { criarServicoImportacoes } from '../../src/modules/imports/service';
import { ARQUIVO_28_DIAS_CSV, ARQUIVO_28_DIAS_XLSX, lerFixture } from '../imports/fixtures';
import { criarBancoDeTeste, semearLoja, type BancoDeTeste } from './banco';

describe('importação de vendas no Postgres', () => {
  let banco: BancoDeTeste;
  let lojaId: number;
  let idDoItem: (nome: string) => number;
  let servico: ReturnType<typeof criarServicoImportacoes>;

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    ({ lojaId, idDoItem } = await semearLoja(banco.db));
    servico = criarServicoImportacoes(banco.db);
  });
  afterAll(() => banco.descartar());

  const totaisVendas = async () => {
    const [t] = await banco.db
      .select({
        linhas: sql<number>`count(*)::int`,
        quantidade: sql<string>`round(sum(${salesDaily.quantity}), 3)`,
        valor: sql<string>`round(sum(${salesDaily.revenue}), 2)`,
      })
      .from(salesDaily);
    return { linhas: t?.linhas, quantidade: Number(t?.quantidade), valor: Number(t?.valor) };
  };

  const vendaDoDia = async (item: string, data: string) => {
    const [v] = await banco.db
      .select({ quantidade: salesDaily.quantity, importId: salesDaily.importId })
      .from(salesDaily)
      .where(and(eq(salesDaily.itemId, idDoItem(item)), eq(salesDaily.saleDate, data)));
    return v;
  };

  // conferido fora do parser (Python lendo o CSV em cp1252)
  const ESPERADO = { linhas: 558, quantidade: 6801.653, valor: 39763.51 };

  it('importa o CSV de 28 dias e soma por item e dia', async () => {
    const resumo = await servico.importar({
      lojaId,
      origem: 'pdv_csv',
      nomeArquivo: ARQUIVO_28_DIAS_CSV,
      conteudo: lerFixture(ARQUIVO_28_DIAS_CSV),
    });
    expect(resumo.importacao).toMatchObject({
      status: 'done',
      linhasTotal: 717,
      linhasMapeadas: 588,
      linhasNaoMapeadas: 129,
    });
    expect(await totaisVendas()).toEqual(ESPERADO);
    expect((await vendaDoDia('Tomate', '2026-10-20'))?.quantidade).toBe(21.409);
  });

  it('reenviar o arquivo (em XLSX) substitui, não soma', async () => {
    const resumo = await servico.importar({
      lojaId,
      origem: 'pdv_xlsx',
      nomeArquivo: ARQUIVO_28_DIAS_XLSX,
      conteudo: lerFixture(ARQUIVO_28_DIAS_XLSX),
    });
    expect(await totaisVendas()).toEqual(ESPERADO);
    expect((await vendaDoDia('Tomate', '2026-10-20'))?.importId).toBe(resumo.importacao.id);
  });

  it('mapear vale para todas as importações e vira alias; ignorar fica salvo na loja', async () => {
    const [primeira] = await servico.listar(lojaId);
    const resumo = await servico.mapear(primeira!.id, {
      mapeamentos: [
        { normalizada: 'BATATA DOCE', itemId: idDoItem('Batata') },
        { normalizada: 'SACOLA PLASTICA', itemId: null },
      ],
    });
    expect(resumo.naoMapeados.map((n) => n.normalizada).sort()).toEqual([
      'AGUA MINERAL 500ML',
      'MANGA PALMER',
      'OVOS BRANCOS GRANDES DZ',
    ]);
    // BATATA LISA + BATATA DOCE no dia 16/10, da importação mais nova
    expect((await vendaDoDia('Batata', '2026-10-16'))?.quantidade).toBe(22.242);

    const [batata] = await banco.db
      .select()
      .from(items)
      .where(eq(items.id, idDoItem('Batata')));
    expect(batata?.aliases).toContain('BATATA DOCE KG');
    const [loja] = await banco.db.select().from(stores).where(eq(stores.id, lojaId));
    expect(loja?.ignoredDescriptions).toEqual(['SACOLA PLASTICA']);
  });
});
