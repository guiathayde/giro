import { readFileSync } from 'node:fs';
import { ITENS } from '../../src/db/dados-seed';
import type { ItemCatalogo } from '../../src/modules/imports/casamento';

export const PASTA_FIXTURES = new URL('../fixtures/pdv/', import.meta.url);

export const ARQUIVO_28_DIAS_CSV = 'vendas-por-produto-28-dias.csv';
export const ARQUIVO_28_DIAS_XLSX = 'vendas-por-produto-28-dias.xlsx';
export const ARQUIVO_28_DIAS_XLS = 'vendas-por-produto-28-dias.xls';
export const ARQUIVO_UM_DIA_CSV = 'vendas-dia-sem-coluna-data.csv';

export function lerFixture(nome: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(nome, PASTA_FIXTURES)));
}

/** catálogo do seed com ids sequenciais, como no banco recém-criado */
export const CATALOGO: ItemCatalogo[] = ITENS.map((item, i) => ({
  id: i + 1,
  name: item.name,
  aliases: item.aliases ?? [],
}));

export const idDoItem = (nome: string): number => {
  const item = CATALOGO.find((i) => i.name === nome);
  if (!item) throw new Error(`item ${nome} não está no catálogo`);
  return item.id;
};

export function texto(conteudo: string, encoding: BufferEncoding = 'utf8'): Uint8Array {
  return new Uint8Array(Buffer.from(conteudo, encoding));
}
