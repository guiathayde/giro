// Perdas (descarte), faltas (ruptura) e contagens de estoque.
import type {
  Contagem,
  Falta,
  FiltroPeriodo,
  NovaContagem,
  NovaFalta,
  NovaPerda,
  Perda,
} from '@giro/shared';
import type { Db } from '../../db/client';
import { naoImplementado } from '../../erros';

export function criarServicoRegistros(db: Db, deps: { agora?: () => Date } = {}) {
  void db;
  void deps;
  const pendente = (nome: string) => () => Promise.reject(naoImplementado(`registros.${nome}`));
  return {
    registrarPerda: pendente('registrarPerda') as (
      lojaId: number,
      dados: NovaPerda,
    ) => Promise<Perda>,
    listarPerdas: pendente('listarPerdas') as (
      lojaId: number,
      filtro: FiltroPeriodo,
    ) => Promise<Perda[]>,
    removerPerda: pendente('removerPerda') as (id: number) => Promise<void>,
    registrarFalta: pendente('registrarFalta') as (
      lojaId: number,
      dados: NovaFalta,
    ) => Promise<Falta>,
    listarFaltas: pendente('listarFaltas') as (
      lojaId: number,
      filtro: FiltroPeriodo,
    ) => Promise<Falta[]>,
    removerFalta: pendente('removerFalta') as (id: number) => Promise<void>,
    registrarContagem: pendente('registrarContagem') as (
      lojaId: number,
      dados: NovaContagem,
    ) => Promise<Contagem>,
    listarContagens: pendente('listarContagens') as (
      lojaId: number,
      filtro: FiltroPeriodo,
    ) => Promise<Contagem[]>,
    removerContagem: pendente('removerContagem') as (id: number) => Promise<void>,
  };
}

export type ServicoRegistros = ReturnType<typeof criarServicoRegistros>;
