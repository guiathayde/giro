// Normalização de textos vindos do PDV. Funções puras.

/** maiúsculas, sem acento, só letras/números separados por um espaço */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

// unidades que o PDV gruda na descrição ("TOMATE KG", "ALFACE UN", "COUVE MC")
const TOKENS_UNIDADE = new Set([
  'KG',
  'KGS',
  'UN',
  'UND',
  'UNID',
  'UNIDADE',
  'MC',
  'MACO',
  'CX',
  'CXA',
  'PC',
  'PCT',
  'BDJ',
]);

/**
 * Chave de comparação de uma descrição de produto (seção 8, fase 1):
 * maiúsculas, sem acento, sem pontuação e sem os tokens de unidade.
 * "Mamão Formosa kg" → "MAMAO FORMOSA".
 */
export function normalizarDescricao(descricao: string): string {
  const tokens = normalizarTexto(descricao).split(' ').filter(Boolean);
  const semUnidade = tokens.filter((t) => !TOKENS_UNIDADE.has(t));
  // se a descrição for só a unidade, mantém o texto original normalizado
  return (semUnidade.length > 0 ? semUnidade : tokens).join(' ');
}
