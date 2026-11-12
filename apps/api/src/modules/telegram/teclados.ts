// Teclados inline do bot.
import { InlineKeyboard } from 'grammy';
import { MOTIVOS_RESPOSTA, ROTULO_MOTIVO_RESPOSTA, type Item } from '@giro/shared';
import { montarCallback, type AcaoItem } from './callbacks';

export function tecladoMotivos(itemSugestaoId: number): InlineKeyboard {
  const teclado = new InlineKeyboard();
  MOTIVOS_RESPOSTA.forEach((motivo, i) => {
    teclado.text(
      ROTULO_MOTIVO_RESPOSTA[motivo],
      montarCallback({ tipo: 'motivo', itemSugestaoId, motivo }),
    );
    if (i % 2 === 1) teclado.row();
  });
  return teclado;
}

/** um botão por candidato, quando o nome bate com mais de um item */
export function tecladoItens(
  acao: AcaoItem,
  candidatos: Item[],
  quantidade: number | null,
): InlineKeyboard {
  const teclado = new InlineKeyboard();
  for (const item of candidatos) {
    teclado
      .text(item.nome, montarCallback({ tipo: 'item', acao, itemId: item.id, quantidade }))
      .row();
  }
  return teclado;
}
