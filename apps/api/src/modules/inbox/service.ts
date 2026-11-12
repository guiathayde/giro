// Inbox do bot: mensagens que ele não entendeu, para o operador agir.
import type { Inbox, MensagemInbox } from '@giro/shared';
import type { Db } from '../../db/client';
import { naoImplementado } from '../../erros';

export interface NovaMensagemInbox {
  lojaId: number | null;
  chatId: number;
  texto: string;
}

export function criarServicoInbox(db: Db) {
  void db;
  return {
    registrar(_dados: NovaMensagemInbox): Promise<void> {
      return Promise.reject(naoImplementado('inbox.registrar'));
    },
    listar(_status: 'abertas' | 'todas'): Promise<Inbox> {
      return Promise.reject(naoImplementado('inbox.listar'));
    },
    resolver(_id: number): Promise<MensagemInbox> {
      return Promise.reject(naoImplementado('inbox.resolver'));
    },
    contarAbertas(): Promise<number> {
      return Promise.reject(naoImplementado('inbox.contarAbertas'));
    },
  };
}

export type ServicoInbox = ReturnType<typeof criarServicoInbox>;
