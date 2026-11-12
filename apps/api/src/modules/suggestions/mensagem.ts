// Mensagem diária para o dono — docs/PLANO-MVP.md, seção 5.5. Pura.
import type { Canal, Unidade } from '@giro/shared';
import type { ResultadoItemMotor } from './engine';

/** linhas de encalhe + pedidos na mensagem; o resto vira "responda tudo para ver" */
export const LIMITE_ITENS_MENSAGEM = 12;

export interface ItemParaMensagem extends ResultadoItemMotor {
  nome: string;
  unidade: Unidade;
}

export interface ItemOrdenado extends ItemParaMensagem {
  /** número do pedido (1..N, por valor decrescente); null para encalhe e não repor */
  posicao: number | null;
}

/** encalhes primeiro, depois pedidos por valor (posições 1..N), depois não repor */
export function ordenarParaMensagem(_itens: ItemParaMensagem[]): ItemOrdenado[] {
  throw new Error('ordenarParaMensagem: não implementado');
}

export interface EntradaMensagem {
  nomeDono: string;
  /** dia da sugestão, AAAA-MM-DD */
  data: string;
  /** no canal manual a mensagem termina com "Responda ok para aceitar…" (os botões não existem) */
  canal: Canal;
  itens: ItemOrdenado[];
}

export function gerarMensagem(_entrada: EntradaMensagem): string {
  throw new Error('gerarMensagem: não implementado');
}
