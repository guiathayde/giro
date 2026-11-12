// Casamento das descrições do PDV com os itens da loja e agregação por dia. Puro.
import { normalizarDescricao } from './normalizacao';
import type { LinhaVenda } from './parser';

export interface ItemCatalogo {
  id: number;
  name: string;
  aliases: string[];
}

/** chave normalizada → id do item; 'ambiguo' quando a mesma chave aponta para itens diferentes */
export type IndiceItens = Map<string, number | 'ambiguo'>;

export function criarIndiceItens(itens: ItemCatalogo[]): IndiceItens {
  const indice: IndiceItens = new Map();
  for (const item of itens) {
    for (const nome of [item.name, ...item.aliases]) {
      const chave = normalizarDescricao(nome);
      if (!chave) continue;
      const atual = indice.get(chave);
      indice.set(chave, atual === undefined || atual === item.id ? item.id : 'ambiguo');
    }
  }
  return indice;
}

/** Procura pelo código do PDV (quando cadastrado como alias) e depois pela descrição. */
export function casarItem(
  indice: IndiceItens,
  descricao: string,
  codigo: string | null,
): number | null {
  for (const chave of [codigo, descricao]) {
    if (!chave) continue;
    const id = indice.get(normalizarDescricao(chave));
    if (typeof id === 'number') return id;
  }
  return null;
}

/** Vendas de um arquivo somadas por dia e descrição normalizada (o que vai para sales_import_rows). */
export interface GrupoVenda {
  data: string;
  normalizada: string;
  /** primeira forma em que a descrição apareceu no arquivo */
  descricao: string;
  codigo: string | null;
  quantidade: number;
  valor: number | null;
  linhas: number;
  itemId: number | null;
  ignorada: boolean;
}

const arredondar = (valor: number, casas: number) => Math.round(valor * 10 ** casas) / 10 ** casas;

export function agruparVendas(
  linhas: LinhaVenda[],
  indice: IndiceItens,
  descricoesIgnoradas: ReadonlySet<string>,
): GrupoVenda[] {
  const grupos = new Map<string, GrupoVenda>();

  for (const linha of linhas) {
    const normalizada = normalizarDescricao(linha.descricao);
    const chave = `${linha.data}|${normalizada}`;
    const grupo = grupos.get(chave);

    if (!grupo) {
      const itemId = casarItem(indice, linha.descricao, linha.codigo);
      grupos.set(chave, {
        data: linha.data,
        normalizada,
        descricao: linha.descricao,
        codigo: linha.codigo,
        quantidade: linha.quantidade,
        valor: linha.valor,
        linhas: 1,
        itemId,
        ignorada: itemId === null && descricoesIgnoradas.has(normalizada),
      });
      continue;
    }

    grupo.quantidade = arredondar(grupo.quantidade + linha.quantidade, 3);
    if (linha.valor !== null) grupo.valor = arredondar((grupo.valor ?? 0) + linha.valor, 2);
    grupo.linhas++;
    if (grupo.itemId === null) {
      grupo.itemId = casarItem(indice, linha.descricao, linha.codigo);
      if (grupo.itemId !== null) grupo.ignorada = false;
    }
  }
  return [...grupos.values()];
}

/** Soma por (item, dia): o que vira sales_daily. O banco faz a mesma conta em SQL. */
export function somarPorItemEDia(grupos: GrupoVenda[]): Map<string, number> {
  const somas = new Map<string, number>();
  for (const g of grupos) {
    if (g.itemId === null) continue;
    const chave = `${g.itemId}|${g.data}`;
    somas.set(chave, arredondar((somas.get(chave) ?? 0) + g.quantidade, 3));
  }
  return somas;
}
