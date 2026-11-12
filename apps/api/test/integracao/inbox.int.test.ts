import { inboxSchema } from '@giro/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { salesImports } from '../../src/db/schema';
import { criarServicoInbox } from '../../src/modules/inbox/service';
import { criarBancoDeTeste, semearLoja, type BancoDeTeste } from './banco';

describe('inbox do bot no Postgres', () => {
  let banco: BancoDeTeste;
  let lojaId: number;
  let servico: ReturnType<typeof criarServicoInbox>;

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    ({ lojaId } = await semearLoja(banco.db));
    servico = criarServicoInbox(banco.db);
  });
  afterAll(() => banco.descartar());

  it('começa vazia', async () => {
    expect(await servico.listar('abertas')).toEqual({ mensagens: [], arquivos: [] });
    expect(await servico.contarAbertas()).toBe(0);
  });

  it('registra mensagens com e sem loja e lista as mais novas primeiro', async () => {
    await servico.registrar({ lojaId, chatId: 111, texto: 'primeira' });
    await servico.registrar({ lojaId: null, chatId: 222, texto: 'de um chat sem loja' });
    await servico.registrar({ lojaId, chatId: 111, texto: 'terceira' });

    const { mensagens } = await servico.listar('abertas');
    expect(mensagens.map((m) => m.texto)).toEqual(['terceira', 'de um chat sem loja', 'primeira']);
    expect(mensagens[0]).toMatchObject({
      lojaId,
      lojaNome: 'Hortifruti Bom Preço (fictícia)',
      chatId: 111,
      resolvidoEm: null,
    });
    expect(mensagens[1]).toMatchObject({ lojaId: null, lojaNome: null, chatId: 222 });
    expect(await servico.contarAbertas()).toBe(3);
  });

  it('resolver tira das abertas, mantém em "todas" e preserva o primeiro horário', async () => {
    const { mensagens } = await servico.listar('abertas');
    const alvo = mensagens.find((m) => m.texto === 'primeira')!;
    const resolvida = await servico.resolver(alvo.id);
    expect(resolvida.resolvidoEm).not.toBeNull();
    expect(resolvida.lojaNome).toBe('Hortifruti Bom Preço (fictícia)');

    expect((await servico.listar('abertas')).mensagens.map((m) => m.id)).not.toContain(alvo.id);
    expect((await servico.listar('todas')).mensagens).toHaveLength(3);
    expect(await servico.contarAbertas()).toBe(2);

    const denovo = await servico.resolver(alvo.id);
    expect(denovo.resolvidoEm).toBe(resolvida.resolvidoEm);
    await expect(servico.resolver(999_999)).rejects.toMatchObject({ status: 404 });
  });

  it('limita a 200 mensagens', async () => {
    for (let i = 0; i < 205; i += 1) {
      await servico.registrar({ lojaId: null, chatId: 1, texto: `msg ${i}` });
    }
    expect((await servico.listar('todas')).mensagens).toHaveLength(200);
  });

  it('arquivos: só origem telegram, últimos 20, sem o conteúdo do arquivo', async () => {
    await banco.db.insert(salesImports).values({
      storeId: lojaId,
      source: 'pdv_csv',
      fileName: 'manual.csv',
      status: 'done',
    });
    for (let i = 0; i < 22; i += 1) {
      await banco.db.insert(salesImports).values({
        storeId: lojaId,
        source: 'telegram',
        fileName: `tg-${i}.csv`,
        periodStart: '2026-11-01',
        periodEnd: '2026-11-11',
        rowsTotal: 10,
        rowsMatched: 8,
        rowsUnmatched: 2,
        status: 'done',
        fileContent: Buffer.from('a;b\n1;2\n'),
      });
    }
    const inbox = await servico.listar('abertas');
    expect(() => inboxSchema.parse(inbox)).not.toThrow();
    expect(inbox.arquivos).toHaveLength(20);
    expect(inbox.arquivos.every((a) => a.origem === 'telegram')).toBe(true);
    expect(inbox.arquivos[0]).toMatchObject({
      lojaId,
      nomeArquivo: 'tg-21.csv',
      inicioPeriodo: '2026-11-01',
      fimPeriodo: '2026-11-11',
      linhasTotal: 10,
      linhasMapeadas: 8,
      linhasNaoMapeadas: 2,
      status: 'done',
      erro: null,
    });
    expect(inbox.arquivos[0]).not.toHaveProperty('fileContent');
  });
});
