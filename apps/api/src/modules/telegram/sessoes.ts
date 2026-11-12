// Estado da conversa do bot (modo ajuste, esperando nota) guardado no banco (bot_sessions).
import type { Db } from '../../db/client';
import type { SessaoBot } from './dependencias';

export function criarServicoSessoes(db: Db) {
  void db;
  return {
    obter(_chatId: number): Promise<SessaoBot | null> {
      return Promise.reject(new Error('sessoes.obter: não implementado'));
    },
    salvar(_sessao: SessaoBot): Promise<void> {
      return Promise.reject(new Error('sessoes.salvar: não implementado'));
    },
    limpar(_chatId: number): Promise<void> {
      return Promise.reject(new Error('sessoes.limpar: não implementado'));
    },
  };
}

export type ServicoSessoes = ReturnType<typeof criarServicoSessoes>;
