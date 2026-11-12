// Sugestões: gerar (motor + mensagem), buscar, enviar pelo canal da loja, painel "Hoje" e rotina diária.
import type { Canal, GerarSugestao, PainelHoje, Sugestao } from '@giro/shared';
import type { Db } from '../../db/client';
import { naoImplementado } from '../../erros';
import type { MessagingChannel } from '../messaging/canal';

export interface DependenciasSugestoes {
  /** telegram é null quando não há token do bot */
  canais: Record<Canal, MessagingChannel | null>;
  /** relógio injetável (testes) */
  agora?: () => Date;
}

export interface ResumoRotinaDiaria {
  lojas: number;
  geradas: number;
  enviadas: number;
  expiradas: number;
  erros: { lojaId: number; erro: string }[];
}

export function criarServicoSugestoes(db: Db, deps: DependenciasSugestoes) {
  void db;
  void deps;
  return {
    /** idempotente por (loja, data): devolve a existente; `refazer` só recalcula rascunho */
    gerar(_lojaId: number, _opcoes: GerarSugestao): Promise<Sugestao> {
      return Promise.reject(naoImplementado('sugestoes.gerar'));
    },
    /** 404 se não existe */
    buscarPorData(_lojaId: number, _data: string): Promise<Sugestao> {
      return Promise.reject(naoImplementado('sugestoes.buscarPorData'));
    },
    /** pelo canal da loja; telegram envia, manual só marca enviada. Não reenvia o que já foi */
    enviar(_sugestaoId: number): Promise<Sugestao> {
      return Promise.reject(naoImplementado('sugestoes.enviar'));
    },
    painelHoje(_data?: string): Promise<PainelHoje> {
      return Promise.reject(naoImplementado('sugestoes.painelHoje'));
    },
    /** sugestões enviadas de dias anteriores sem resposta → expired; itens sem resposta → ignored */
    expirarPendentes(_lojaId: number, _hoje: string): Promise<number> {
      return Promise.reject(naoImplementado('sugestoes.expirarPendentes'));
    },
    /** job das 05:30: por loja, expira, gera e envia se envioAutomatico */
    executarRotinaDiaria(): Promise<ResumoRotinaDiaria> {
      return Promise.reject(naoImplementado('sugestoes.executarRotinaDiaria'));
    },
  };
}

export type ServicoSugestoes = ReturnType<typeof criarServicoSugestoes>;
