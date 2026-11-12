// Parser das respostas do dono ao pedido: "1 35", "2 20,5", "3: 0 kg"... Puro.
import type { Ajuste } from './dependencias';

export interface ResultadoParse {
  ajustes: Ajuste[];
  /** linhas que não deu para entender (texto original) */
  invalidas: string[];
}

const UNIDADES = 'kg|un|unid|maço|maco|mc|cx';
// posição, separador (espaço ou - : = )), quantidade (vírgula ou ponto decimal), unidade opcional
const LINHA = new RegExp(
  `^(\\d{1,3})(?:\\s*[-:=)]\\s*|\\s+)(\\d+(?:[.,]\\d+)?)\\s*(?:${UNIDADES})?\\.?$`,
  'i',
);

/** Uma linha por item (quebra de linha ou ";"). Não separa por vírgula: "2 20,5" é decimal. */
export function parseAdjustments(texto: string): ResultadoParse {
  const porPosicao = new Map<number, number>();
  const invalidas: string[] = [];

  for (const bruta of texto.split(/[\n;]/)) {
    const linha = bruta.trim().replace(/\s+/g, ' ');
    if (!linha) continue;
    const m = LINHA.exec(linha);
    const quantidade = m?.[2] ? Number(m[2].replace(',', '.')) : NaN;
    if (!m?.[1] || !Number.isFinite(quantidade)) {
      invalidas.push(linha);
      continue;
    }
    // posição repetida: a última vale
    porPosicao.set(Number(m[1]), quantidade);
  }

  return {
    ajustes: [...porPosicao].map(([posicao, quantidade]) => ({ posicao, quantidade })),
    invalidas,
  };
}
