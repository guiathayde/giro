// Dados de teste do bot.
import type { Item, ItemSugestao, Sugestao } from '@giro/shared';

export function itemFalso(parcial: Partial<Item> & Pick<Item, 'id' | 'nome'>): Item {
  return {
    lojaId: 1,
    unidade: 'kg',
    vidaUtilDias: 5,
    custoMedio: null,
    precoMedio: null,
    multiploPedido: null,
    ativo: true,
    aliases: [],
    ...parcial,
  };
}

export function itemSugestaoFalso(
  parcial: Partial<ItemSugestao> & Pick<ItemSugestao, 'id' | 'itemNome'>,
): ItemSugestao {
  return {
    itemId: parcial.id + 100,
    unidade: 'kg',
    acao: 'order',
    posicao: null,
    quantidadeSugerida: 10,
    previsao: 10,
    estoqueEstimado: null,
    diasCobertura: null,
    estimativaFraca: false,
    motivo: null,
    resposta: null,
    quantidadeResposta: null,
    motivoResposta: null,
    notaResposta: null,
    respondidoEm: null,
    ...parcial,
  };
}

export function sugestaoFalsa(lojaId: number, itens: ItemSugestao[], id = 7): Sugestao {
  return {
    id,
    lojaId,
    data: '2026-11-12',
    geradaEm: '2026-11-12T08:00:00.000Z',
    status: 'sent',
    canal: 'telegram',
    mensagem: null,
    enviadaEm: '2026-11-12T08:00:00.000Z',
    itens,
  };
}
