// Formato do callback_data dos botões inline (máx. 64 bytes). Usado por quem monta o teclado
// (TelegramChannel) e por quem trata o clique (handlers do bot). Puro.
import { MOTIVOS_RESPOSTA, type MotivoResposta } from '@giro/shared';

export const ACOES_ITEM = ['perda', 'falta', 'estoque'] as const;
export type AcaoItem = (typeof ACOES_ITEM)[number];

export type Callback =
  /** [Aceitar tudo] da mensagem diária */
  | { tipo: 'aceitar'; sugestaoId: number }
  /** [Ajustar] da mensagem diária */
  | { tipo: 'ajustar'; sugestaoId: number }
  /** botão de motivo depois de um ajuste */
  | { tipo: 'motivo'; itemSugestaoId: number; motivo: MotivoResposta }
  /** desambiguação de /perda, /falta, /estoque quando o nome bate com mais de um item */
  | { tipo: 'item'; acao: AcaoItem; itemId: number; quantidade: number | null };

export function montarCallback(c: Callback): string {
  switch (c.tipo) {
    case 'aceitar':
      return `a:${c.sugestaoId}`;
    case 'ajustar':
      return `j:${c.sugestaoId}`;
    case 'motivo':
      return `m:${c.itemSugestaoId}:${c.motivo}`;
    case 'item':
      return `i:${c.acao}:${c.itemId}:${c.quantidade ?? ''}`;
  }
}

const inteiro = (t: string | undefined) => (t && /^\d+$/.test(t) ? Number(t) : null);

export function lerCallback(dados: string): Callback | null {
  const [tipo, a, b, c] = dados.split(':');
  switch (tipo) {
    case 'a':
    case 'j': {
      const sugestaoId = inteiro(a);
      if (sugestaoId === null) return null;
      return { tipo: tipo === 'a' ? 'aceitar' : 'ajustar', sugestaoId };
    }
    case 'm': {
      const itemSugestaoId = inteiro(a);
      const motivo = MOTIVOS_RESPOSTA.find((m) => m === b);
      return itemSugestaoId === null || !motivo ? null : { tipo: 'motivo', itemSugestaoId, motivo };
    }
    case 'i': {
      const acao = ACOES_ITEM.find((x) => x === a);
      const itemId = inteiro(b);
      const quantidade = c === undefined || c === '' ? null : Number(c);
      if (!acao || itemId === null || (quantidade !== null && !Number.isFinite(quantidade))) {
        return null;
      }
      return { tipo: 'item', acao, itemId, quantidade };
    }
    default:
      return null;
  }
}
