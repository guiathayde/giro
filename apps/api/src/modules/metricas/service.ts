// Métricas do piloto (seção 1 do plano).
import type { FiltroPeriodo, MetricasCanais, MetricasLoja } from '@giro/shared';
import type { Db } from '../../db/client';
import { naoImplementado } from '../../erros';

export function criarServicoMetricas(db: Db, deps: { agora?: () => Date } = {}) {
  void db;
  void deps;
  return {
    /** sem from/to: da primeira venda importada até hoje */
    daLoja(_lojaId: number, _filtro: FiltroPeriodo): Promise<MetricasLoja> {
      return Promise.reject(naoImplementado('metricas.daLoja'));
    },
    canais(): Promise<MetricasCanais> {
      return Promise.reject(naoImplementado('metricas.canais'));
    },
  };
}

export type ServicoMetricas = ReturnType<typeof criarServicoMetricas>;
