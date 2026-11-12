import { somarDias } from '../../src/datas';
import type {
  EntradaItemMotor,
  EntradaMotor,
  VendaDia,
} from '../../src/modules/suggestions/engine';

/** quinta-feira. Referências: qua 11-11, ter 11-10, seg 11-09, dom 11-08, sáb 11-07, sex 11-06, qui 11-05 */
export const HOJE = '2026-11-12';

/** os `n` dias antes de `hoje`, do mais antigo para o mais recente */
export function diasAntes(hoje: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => somarDias(hoje, i - n));
}

/** vendas dos `n` dias antes de hoje (todos com dado); `f` recebe a data e devolve a quantidade */
export function serie(
  hoje: string,
  n: number,
  f: (data: string) => number,
): { diasComDados: string[]; vendas: VendaDia[] } {
  const dias = diasAntes(hoje, n);
  return { diasComDados: dias, vendas: dias.map((data) => ({ data, quantidade: f(data) })) };
}

export function itemBase(parcial: Partial<EntradaItemMotor> = {}): EntradaItemMotor {
  return {
    itemId: 1,
    nome: 'Tomate',
    unidade: 'kg',
    vidaUtilDias: 1,
    custoMedio: null,
    multiploPedido: null,
    vendas: [],
    estoque: { quantidade: 0, fraca: false, diasDesdeContagem: 1 },
    teveRuptura: false,
    ...parcial,
  };
}

export function entradaMotor(
  item: EntradaItemMotor,
  diasComDados: string[],
  parcial: Partial<EntradaMotor> = {},
): EntradaMotor {
  return { hoje: HOJE, diasComDados, eventos: [], itens: [item], ...parcial };
}
