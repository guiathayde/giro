import { describe, expect, it } from 'vitest';
import { lerCallback, montarCallback, type Callback } from '../../src/modules/telegram/callbacks';

describe('callback_data dos botões', () => {
  const casos: Callback[] = [
    { tipo: 'aceitar', sugestaoId: 12 },
    { tipo: 'ajustar', sugestaoId: 12 },
    { tipo: 'motivo', itemSugestaoId: 345, motivo: 'stock_wrong' },
    { tipo: 'item', acao: 'perda', itemId: 3, quantidade: 6.5 },
    { tipo: 'item', acao: 'falta', itemId: 3, quantidade: null },
  ];

  it.each(casos)('ida e volta: %o', (c) => {
    const dados = montarCallback(c);
    expect(Buffer.byteLength(dados)).toBeLessThanOrEqual(64);
    expect(lerCallback(dados)).toEqual(c);
  });

  it.each(['', 'x:1', 'a:', 'a:abc', 'm:1:inexistente', 'i:roubo:1:2', 'i:perda:1:abc'])(
    'recusa %s',
    (dados) => {
      expect(lerCallback(dados)).toBeNull();
    },
  );
});
