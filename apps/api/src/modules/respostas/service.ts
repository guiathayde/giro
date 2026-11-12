// Resposta do dono à sugestão (aceitou / ajustou / ignorou) e compras que ela gera.
import type { ItemSugestao, MotivoResposta, RegistrarResposta, Sugestao } from '@giro/shared';
import type { Db } from '../../db/client';
import { naoImplementado } from '../../erros';

export interface Ajuste {
  /** número do pedido na mensagem */
  posicao: number;
  quantidade: number;
}

export interface ResultadoAjuste {
  aplicados: ItemSugestao[];
  /** posições que não existem nesta sugestão */
  posicoesInvalidas: number[];
}

export function criarServicoRespostas(db: Db, deps: { agora?: () => Date } = {}) {
  void db;
  void deps;
  return {
    registrar(_itemSugestaoId: number, _dados: RegistrarResposta): Promise<ItemSugestao> {
      return Promise.reject(naoImplementado('respostas.registrar'));
    },
    aceitarTudo(_sugestaoId: number): Promise<Sugestao> {
      return Promise.reject(naoImplementado('respostas.aceitarTudo'));
    },
    /** sugestão de hoje (fuso da loja) já enviada, que ainda aceita resposta; null se não houver */
    sugestaoAtiva(_lojaId: number): Promise<Sugestao | null> {
      return Promise.reject(naoImplementado('respostas.sugestaoAtiva'));
    },
    /** aplica "N qtd"; itens ainda sem resposta ficam aceitos (seção 5.2) */
    ajustar(_sugestaoId: number, _ajustes: Ajuste[]): Promise<ResultadoAjuste> {
      return Promise.reject(naoImplementado('respostas.ajustar'));
    },
    definirMotivo(_itemSugestaoId: number, _motivo: MotivoResposta): Promise<ItemSugestao> {
      return Promise.reject(naoImplementado('respostas.definirMotivo'));
    },
    definirNota(_itemSugestaoId: number, _nota: string): Promise<ItemSugestao> {
      return Promise.reject(naoImplementado('respostas.definirNota'));
    },
  };
}

export type ServicoRespostas = ReturnType<typeof criarServicoRespostas>;
