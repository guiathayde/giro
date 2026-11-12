// Eventos de calendário (feriado, feira) que mexem na previsão de venda.
import type { EventoCalendario, FiltroPeriodo, NovoEvento } from '@giro/shared';
import type { Db } from '../../db/client';
import { naoImplementado } from '../../erros';

export function criarServicoCalendario(db: Db) {
  void db;
  return {
    /** eventos da loja e os globais (store_id null) */
    listar(_lojaId: number, _filtro: FiltroPeriodo): Promise<EventoCalendario[]> {
      return Promise.reject(naoImplementado('calendario.listar'));
    },
    criar(_dados: NovoEvento): Promise<EventoCalendario> {
      return Promise.reject(naoImplementado('calendario.criar'));
    },
    remover(_id: number): Promise<void> {
      return Promise.reject(naoImplementado('calendario.remover'));
    },
  };
}

export type ServicoCalendario = ReturnType<typeof criarServicoCalendario>;
