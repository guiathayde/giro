// Parte pura de /perda, /falta e /estoque: leitura dos argumentos e casamento com os itens.
import type { Item } from '@giro/shared';
import { normalizarDescricao } from '../imports/normalizacao';

export interface ArgumentosComando {
  termo: string;
  quantidade: number | null;
}

const NUMERO = /^\d+(?:[.,]\d+)?$/;
const NUMERO_COM_UNIDADE = /^(\d+(?:[.,]\d+)?)(?:kg|un|unid|maço|maco|mc|cx)$/i;
const UNIDADE = /^(?:kg|un|unid|maço|maco|mc|cx)$/i;

const paraNumero = (t: string) => Number(t.replace(',', '.'));

/** "mamão formosa 6,5" → {termo: "mamão formosa", quantidade: 6.5}; "tomate 15 kg" idem */
export function parsearArgumentos(texto: string): ArgumentosComando {
  const tokens = texto.trim().split(/\s+/).filter(Boolean);
  let quantidade: number | null = null;

  const ultimo = tokens.at(-1);
  const penultimo = tokens.at(-2);
  if (ultimo && UNIDADE.test(ultimo) && penultimo && NUMERO.test(penultimo)) {
    quantidade = paraNumero(penultimo);
    tokens.splice(-2, 2);
  } else if (ultimo && NUMERO.test(ultimo)) {
    quantidade = paraNumero(ultimo);
    tokens.pop();
  } else {
    const comUnidade = ultimo ? NUMERO_COM_UNIDADE.exec(ultimo) : null;
    if (comUnidade?.[1]) {
      quantidade = paraNumero(comUnidade[1]);
      tokens.pop();
    }
  }
  return { termo: tokens.join(' '), quantidade };
}

/** Itens ativos que combinam com o termo: igualdade exata vence; senão começa com ou tem todas as palavras. */
export function casarItens(termo: string, itens: Item[]): Item[] {
  const alvo = normalizarDescricao(termo);
  if (!alvo) return [];
  const tokens = alvo.split(' ');

  const nomesNormalizados = (item: Item) =>
    [item.nome, ...item.aliases].map(normalizarDescricao).filter(Boolean);

  const ativos = itens.filter((i) => i.ativo);
  const exatos = ativos.filter((i) => nomesNormalizados(i).includes(alvo));
  if (exatos.length > 0) return exatos;

  return ativos.filter((i) =>
    nomesNormalizados(i).some(
      (n) => n.startsWith(alvo) || tokens.every((t) => n.split(' ').includes(t)),
    ),
  );
}
