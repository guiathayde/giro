import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarServicoCalendario } from '../../src/modules/calendario/service';
import { criarServicoLojas } from '../../src/modules/stores/service';
import { criarBancoDeTeste, semearLoja, type BancoDeTeste } from './banco';

describe('cadastros e calendário no Postgres', () => {
  let banco: BancoDeTeste;
  let lojaSeedId: number;
  let lojas: ReturnType<typeof criarServicoLojas>;
  let calendario: ReturnType<typeof criarServicoCalendario>;

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    ({ lojaId: lojaSeedId } = await semearLoja(banco.db));
    lojas = criarServicoLojas(banco.db);
    calendario = criarServicoCalendario(banco.db);
  });
  afterAll(() => banco.descartar());

  describe('lojas', () => {
    it('cria loja normalizando o WhatsApp e aplicando padrões', async () => {
      const loja = await lojas.criar({
        nome: 'Sacolão Novo',
        nomeDono: 'Dona Rosa',
        whatsapp: '16991234567',
      });
      expect(loja).toMatchObject({
        nome: 'Sacolão Novo',
        nomeDono: 'Dona Rosa',
        whatsapp: '5516991234567',
        canal: 'manual',
        telegramVinculado: false,
        envioAutomatico: false,
        sistemaPdv: null,
        fusoHorario: 'America/Sao_Paulo',
        mapeamentoColunas: null,
      });
    });

    it('edita só os campos enviados, inclusive envioAutomatico', async () => {
      const loja = await lojas.criar({ nome: 'Loja X', nomeDono: 'Zé', whatsapp: '5516991234567' });
      const editada = await lojas.editar(loja.id, { envioAutomatico: true, sistemaPdv: 'Linx' });
      expect(editada).toEqual({
        ...loja,
        envioAutomatico: true,
        sistemaPdv: 'Linx',
      });
      const semWhats = await lojas.editar(loja.id, { whatsapp: null, nome: 'Loja Y' });
      expect(semWhats).toMatchObject({ nome: 'Loja Y', whatsapp: null, envioAutomatico: true });
      expect(await lojas.editar(loja.id, {})).toEqual(semWhats);
    });

    it('404 ao editar loja inexistente', async () => {
      await expect(lojas.editar(9999, { nome: 'X' })).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('itens', () => {
    const novo = { nome: 'Rúcula', unidade: 'maco' as const, vidaUtilDias: 3 };

    it('cria item com padrões e aliases limpos', async () => {
      const item = await lojas.criarItem(lojaSeedId, {
        ...novo,
        aliases: ['  RUCULA MC ', 'Rúcula', 'Rucula Hidroponica'],
      });
      expect(item).toMatchObject({
        lojaId: lojaSeedId,
        nome: 'Rúcula',
        unidade: 'maco',
        vidaUtilDias: 3,
        custoMedio: null,
        precoMedio: null,
        multiploPedido: null,
        ativo: true,
        aliases: ['RUCULA MC', 'Rucula Hidroponica'],
      });
    });

    it('409 com nome repetido na loja, mas o mesmo nome vale em outra loja', async () => {
      await expect(lojas.criarItem(lojaSeedId, { ...novo, nome: 'Tomate' })).rejects.toMatchObject({
        status: 409,
        message: 'Já existe um item com esse nome',
      });
      const outra = await lojas.criar({ nome: 'Outra', nomeDono: 'Fulano' });
      await expect(lojas.criarItem(outra.id, { ...novo, nome: 'Tomate' })).resolves.toMatchObject({
        nome: 'Tomate',
      });
    });

    it('404 ao criar item em loja inexistente', async () => {
      await expect(lojas.criarItem(9999, novo)).rejects.toMatchObject({ status: 404 });
    });

    it('edita item; aliases substitui a lista inteira', async () => {
      const item = await lojas.criarItem(lojaSeedId, {
        nome: 'Agrião',
        unidade: 'maco',
        vidaUtilDias: 2,
        aliases: ['AGRIAO MC'],
      });
      const editado = await lojas.editarItem(item.id, {
        aliases: ['Agrião Maço', 'agriao maco', 'AGRIAO'],
        custoMedio: 2.5,
        ativo: false,
      });
      expect(editado).toMatchObject({
        nome: 'Agrião',
        aliases: ['Agrião Maço'],
        custoMedio: 2.5,
        ativo: false,
      });
      const limpo = await lojas.editarItem(item.id, { aliases: [], multiploPedido: 2 });
      expect(limpo).toMatchObject({ aliases: [], multiploPedido: 2, custoMedio: 2.5 });
    });

    it('404 ao editar item inexistente e 409 ao renomear para nome existente', async () => {
      await expect(lojas.editarItem(999999, { ativo: false })).rejects.toMatchObject({
        status: 404,
      });
      const item = await lojas.criarItem(lojaSeedId, {
        nome: 'Hortelã',
        unidade: 'maco',
        vidaUtilDias: 3,
      });
      await expect(lojas.editarItem(item.id, { nome: 'Cebola' })).rejects.toMatchObject({
        status: 409,
        message: 'Já existe um item com esse nome',
      });
    });
  });

  describe('calendário', () => {
    it('lista eventos da loja e globais por data, só do período', async () => {
      const outra = await lojas.criar({ nome: 'Loja do calendário', nomeDono: 'Ana' });
      const alheia = await lojas.criar({ nome: 'Outra loja', nomeDono: 'Beto' });
      const feira = await calendario.criar({
        lojaId: outra.id,
        data: '2026-12-10',
        tipo: 'fair',
        descricao: 'Feira do bairro',
        fatorDemanda: 1.3,
      });
      const natal = await calendario.criar({
        data: '2026-12-05',
        tipo: 'holiday',
        descricao: 'Feriado global',
      });
      await calendario.criar({
        lojaId: alheia.id,
        data: '2026-12-07',
        tipo: 'event',
        descricao: 'Evento de outra loja',
      });
      await calendario.criar({
        data: '2027-03-01',
        tipo: 'holiday',
        descricao: 'Fora do período',
      });

      const eventos = await calendario.listar(outra.id, { from: '2026-12-01', to: '2026-12-31' });
      expect(eventos).toEqual([
        { ...natal, lojaId: null, fatorDemanda: 1 },
        { ...feira, lojaId: outra.id, fatorDemanda: 1.3 },
      ]);
    });

    it('padrão de período: de hoje até +60 dias', async () => {
      const loja = await lojas.criar({ nome: 'Padrão', nomeDono: 'Caio' });
      const dia = (n: number) => {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() + n);
        return d.toISOString().slice(0, 10);
      };
      await calendario.criar({
        lojaId: loja.id,
        data: dia(30),
        tipo: 'event',
        descricao: 'dentro',
      });
      await calendario.criar({ lojaId: loja.id, data: dia(90), tipo: 'event', descricao: 'fora' });
      await calendario.criar({
        lojaId: loja.id,
        data: dia(-5),
        tipo: 'event',
        descricao: 'passado',
      });
      const eventos = await calendario.listar(loja.id, {});
      const daLoja = eventos.filter((e) => e.lojaId === loja.id);
      expect(daLoja.map((e) => e.descricao)).toEqual(['dentro']);
    });

    it('404 em loja inexistente (listar e criar) e ao remover; remove de verdade', async () => {
      await expect(calendario.listar(9999, {})).rejects.toMatchObject({ status: 404 });
      await expect(
        calendario.criar({ lojaId: 9999, data: '2026-12-01', tipo: 'fair', descricao: 'x' }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(calendario.remover(999999)).rejects.toMatchObject({ status: 404 });

      const e = await calendario.criar({
        lojaId: lojaSeedId,
        data: '2026-12-20',
        tipo: 'event',
        descricao: 'remover',
      });
      await calendario.remover(e.id);
      const restantes = await calendario.listar(lojaSeedId, {
        from: '2026-12-20',
        to: '2026-12-20',
      });
      expect(restantes).toEqual([]);
    });
  });
});
