// Interpretação da tabela lida do PDV: acha o cabeçalho, as colunas e as linhas de venda.
// Puro e sem datas do sistema: tudo vem do arquivo.
import type { ColunasDetectadas, MapeamentoColunas } from '@giro/shared';
import type { Celula, Tabela } from './arquivo';
import { normalizarTexto } from './normalizacao';

export interface LinhaVenda {
  /** AAAA-MM-DD */
  data: string;
  descricao: string;
  codigo: string | null;
  quantidade: number;
  valor: number | null;
}

export type ResultadoParse =
  | {
      ok: true;
      colunas: ColunasDetectadas;
      /** linha de cabeçalho inteira, para o operador corrigir a escolha das colunas */
      cabecalhos: string[];
      linhas: LinhaVenda[];
      /** linhas fora da tabela de vendas: totais, sem descrição, quantidade ou data inválida */
      descartadas: { motivo: string; linhas: number }[];
      periodo: { inicio: string; fim: string };
    }
  | { ok: false; erro: string; cabecalhos: string[] };

// ---------- colunas ----------

type Papel = keyof ColunasDetectadas;

/** nomes de cabeçalho conhecidos, já normalizados, em ordem de preferência */
const SINONIMOS: Record<Papel, string[]> = {
  descricao: [
    'DESCRICAO',
    'DESCRICAO PRODUTO',
    'DESCRICAO DO PRODUTO',
    'PRODUTO',
    'NOME PRODUTO',
    'NOME DO PRODUTO',
    'NOME',
    'MERCADORIA',
    'ITEM',
    'DESC',
  ],
  quantidade: [
    'QTDE',
    'QTD',
    'QUANTIDADE',
    'QTDE VENDIDA',
    'QTD VENDIDA',
    'QUANTIDADE VENDIDA',
    'QTD VENDA',
    'QUANT',
    'QT',
    'PESO',
    'PESO KG',
  ],
  data: [
    'DATA',
    'DATA VENDA',
    'DATA DA VENDA',
    'DT VENDA',
    'DT',
    'DIA',
    'DATA MOVIMENTO',
    'DT MOVIMENTO',
    'DATA EMISSAO',
    'DT EMISSAO',
    'EMISSAO',
  ],
  valor: [
    'VL TOTAL',
    'VLR TOTAL',
    'VALOR TOTAL',
    'VALOR TOTAL R',
    'TOTAL',
    'TOTAL R',
    'VALOR LIQUIDO',
    'VL LIQUIDO',
    'TOTAL LIQUIDO',
    'VALOR',
    'VALOR VENDA',
    'VALOR DA VENDA',
    'TOTAL VENDA',
    'VENDA',
    'FATURAMENTO',
    'RECEITA',
  ],
  codigo: [
    'CODIGO',
    'COD',
    'COD PRODUTO',
    'CODIGO PRODUTO',
    'CODIGO DO PRODUTO',
    'PLU',
    'SKU',
    'EAN',
    'GTIN',
    'COD BARRAS',
    'CODIGO BARRAS',
    'CODIGO DE BARRAS',
    'REFERENCIA',
    'REF',
  ],
};

/** cabeçalhos que começam com estes tokens mas não são o que parecem (ex.: "VALOR UNITARIO") */
const EXCLUSOES: Partial<Record<Papel, string[]>> = {
  valor: ['UNIT', 'UNITARIO', 'PRECO', 'CUSTO', 'DESCONTO', 'ACRESCIMO'],
};

function pontuar(papel: Papel, cabecalho: string): number | null {
  if (!cabecalho) return null;
  const exato = SINONIMOS[papel].indexOf(cabecalho);
  if (exato >= 0) return exato;
  // aproximado: começa com um sinônimo de uma palavra ("QTDE KG", "DESCRICAO REDUZIDA")
  const tokens = cabecalho.split(' ');
  if (EXCLUSOES[papel]?.some((t) => tokens.includes(t))) return null;
  const primeiro = SINONIMOS[papel].findIndex((s) => !s.includes(' ') && s === tokens[0]);
  return primeiro >= 0 ? 100 + primeiro : null;
}

type IndiceColunas = Partial<Record<Papel, number>>;

function textoCelula(celula: Celula | undefined): string {
  return celula === null || celula === undefined ? '' : String(celula).trim();
}

function atribuirPorHeuristica(normalizados: string[], jaUsadas: Set<number>): IndiceColunas {
  const candidatos: { papel: Papel; coluna: number; pontos: number }[] = [];
  normalizados.forEach((cabecalho, coluna) => {
    if (jaUsadas.has(coluna)) return;
    for (const papel of Object.keys(SINONIMOS) as Papel[]) {
      const pontos = pontuar(papel, cabecalho);
      if (pontos !== null) candidatos.push({ papel, coluna, pontos });
    }
  });
  candidatos.sort((a, b) => a.pontos - b.pontos);

  const indice: IndiceColunas = {};
  const usadas = new Set(jaUsadas);
  for (const { papel, coluna } of candidatos) {
    if (indice[papel] !== undefined || usadas.has(coluna)) continue;
    indice[papel] = coluna;
    usadas.add(coluna);
  }
  return indice;
}

function atribuirColunas(
  linha: Celula[],
  mapeamento: MapeamentoColunas | null | undefined,
): IndiceColunas | null {
  const normalizados = linha.map((c) => (typeof c === 'string' ? normalizarTexto(c) : ''));
  const indice: IndiceColunas = {};
  const usadas = new Set<number>();

  if (mapeamento) {
    for (const papel of Object.keys(SINONIMOS) as Papel[]) {
      const nome = mapeamento[papel];
      if (!nome) continue;
      const coluna = normalizados.indexOf(normalizarTexto(nome));
      if (coluna < 0) {
        if (papel === 'descricao' || papel === 'quantidade') return null;
        continue;
      }
      indice[papel] = coluna;
      usadas.add(coluna);
    }
  }

  const heuristica = atribuirPorHeuristica(normalizados, usadas);
  for (const papel of Object.keys(heuristica) as Papel[]) {
    if (indice[papel] === undefined && !mapeamento?.[papel]) indice[papel] = heuristica[papel];
  }
  return indice.descricao !== undefined && indice.quantidade !== undefined ? indice : null;
}

const LINHAS_PARA_CABECALHO = 30;

function acharCabecalho(
  linhas: Celula[][],
  mapeamento: MapeamentoColunas | null | undefined,
): { linha: number; indice: IndiceColunas } | null {
  for (let i = 0; i < Math.min(linhas.length, LINHAS_PARA_CABECALHO); i++) {
    const indice = atribuirColunas(linhas[i] ?? [], mapeamento);
    if (indice) return { linha: i, indice };
  }
  return null;
}

/** linha com mais textos no começo do arquivo: provavelmente o cabeçalho, para o operador mapear */
function provavelCabecalho(linhas: Celula[][]): string[] {
  let melhor: string[] = [];
  for (const linha of linhas.slice(0, LINHAS_PARA_CABECALHO)) {
    const textos = linha.filter(
      (c): c is string => typeof c === 'string' && parseNumero(c, 'br') === null,
    );
    if (textos.length > melhor.length) melhor = textos;
  }
  return melhor;
}

// ---------- números ----------

export type FormatoNumero = 'br' | 'us';

const NUMERO_LIMPO = /^-?\d+(\.\d+)?$/;

export function parseNumero(celula: Celula | undefined, formato: FormatoNumero): number | null {
  if (typeof celula === 'number') return Number.isFinite(celula) ? celula : null;
  if (typeof celula !== 'string') return null;

  let texto = celula.replace(/R\$|\s/g, ''); /* \s inclui o espaço não separável */
  let negativo = false;
  if (/^\(.*\)$/.test(texto)) {
    negativo = true;
    texto = texto.slice(1, -1);
  }
  if (texto.endsWith('-')) {
    negativo = true;
    texto = texto.slice(0, -1);
  }
  if (texto.startsWith('-')) {
    negativo = !negativo;
    texto = texto.slice(1);
  }

  texto = formato === 'br' ? texto.replace(/\./g, '').replace(',', '.') : texto.replace(/,/g, '');
  if (!NUMERO_LIMPO.test(texto)) return null;
  const valor = Number(texto);
  return negativo ? -valor : valor;
}

const PARECE_NUMERO = /^[-(]?\d[\d.,]*[)-]?$/;

/**
 * Decide o formato de uma coluna olhando todos os valores dela, não célula a célula:
 * "18.350" sozinho é ambíguo (18,35 kg ou 18 mil); "27.8" na mesma coluna resolve.
 * Devolve null quando nenhum valor da coluna resolve.
 */
export function detectarFormatoNumero(valores: Celula[]): FormatoNumero | null {
  const textos = valores
    .filter((v): v is string => typeof v === 'string')
    .map((t) => t.replace(/R\$|\s/g, ''))
    .filter((t) => PARECE_NUMERO.test(t));
  for (const t of textos) {
    const virgula = t.lastIndexOf(',');
    const ponto = t.lastIndexOf('.');
    if (virgula >= 0 && ponto >= 0) return virgula > ponto ? 'br' : 'us';
  }
  if (textos.some((t) => t.includes(','))) return 'br';
  if (textos.some((t) => /\.(\d{1,2}|\d{4,})\)?-?$/.test(t))) return 'us';
  return null;
}

/** Formato que as colunas numéricas do arquivo indicam (maioria), para resolver uma coluna ambígua. */
function formatoDoArquivo(corpo: Celula[][], colunasDeTexto: Set<number>): FormatoNumero | null {
  const largura = Math.max(0, ...corpo.map((l) => l.length));
  const votos = { br: 0, us: 0 };
  for (let c = 0; c < largura; c++) {
    if (colunasDeTexto.has(c)) continue;
    const formato = detectarFormatoNumero(corpo.map((l) => l[c] ?? null));
    if (formato) votos[formato]++;
  }
  if (votos.br === votos.us) return null;
  return votos.br > votos.us ? 'br' : 'us';
}

// ---------- datas ----------

function dataValida(ano: number, mes: number, dia: number): string | null {
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return null;
  }
  return d.toISOString().slice(0, 10);
}

/** 'AAAA-MM-DD' a partir de "10/11/2026", "10/11/26", "2026-11-10", "10/11/2026 08:15" ou serial do Excel */
export function parseData(celula: Celula | undefined): string | null {
  if (typeof celula === 'number') {
    // serial do Excel entre 2000 e 2100
    if (celula < 36_526 || celula > 73_051) return null;
    const ms = Date.UTC(1899, 11, 30) + Math.floor(celula) * 86_400_000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (typeof celula !== 'string') return null;
  const texto = celula.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(texto);
  if (iso) return dataValida(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?:$|\s)/.exec(texto);
  if (br) {
    const ano = br[3]!.length === 2 ? 2000 + Number(br[3]) : Number(br[3]);
    return dataValida(ano, Number(br[2]), Number(br[1]));
  }
  return null;
}

const PALAVRAS_EMISSAO = ['EMITIDO', 'EMISSAO', 'GERADO', 'IMPRESSO', 'IMPRESSAO', 'HORA'];

/** datas citadas nas linhas de título ("Período: 03/11/2026 a 09/11/2026", "Data: 10/11/2026") */
function datasDoTitulo(linhasTitulo: Celula[][]): string[] {
  const datas = new Set<string>();
  for (const linha of linhasTitulo) {
    const texto = linha.map(textoCelula).join(' ');
    const normalizado = normalizarTexto(texto);
    if (PALAVRAS_EMISSAO.some((p) => normalizado.includes(p))) continue;
    for (const m of texto.matchAll(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g)) {
      const data = parseData(m[0]);
      if (data) datas.add(data);
    }
  }
  return [...datas].sort();
}

function dataCurta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

// ---------- linhas ----------

function ehLinhaDeTotal(linha: Celula[]): boolean {
  return linha.some((c) => {
    if (typeof c !== 'string') return false;
    const t = normalizarTexto(c);
    return t.startsWith('TOTAL') || t.startsWith('SUBTOTAL');
  });
}

export function parsearVendas(
  tabela: Tabela,
  mapeamento?: MapeamentoColunas | null,
): ResultadoParse {
  const { linhas } = tabela;
  // o mapeamento salvo da loja tem prioridade; se o arquivo vier em outro layout, tenta a detecção
  const cabecalho =
    (mapeamento ? acharCabecalho(linhas, mapeamento) : null) ?? acharCabecalho(linhas, null);
  if (!cabecalho) {
    return {
      ok: false,
      erro: 'Não encontrei as colunas de descrição e quantidade no arquivo.',
      cabecalhos: provavelCabecalho(linhas),
    };
  }

  const { indice } = cabecalho;
  const linhaCabecalho = linhas[cabecalho.linha] ?? [];
  const nomeColuna = (i: number | undefined) =>
    i === undefined ? null : textoCelula(linhaCabecalho[i]);
  const colunas: ColunasDetectadas = {
    descricao: nomeColuna(indice.descricao) ?? '',
    quantidade: nomeColuna(indice.quantidade) ?? '',
    data: nomeColuna(indice.data),
    valor: nomeColuna(indice.valor),
    codigo: nomeColuna(indice.codigo),
  };
  const cabecalhos = linhaCabecalho.map(textoCelula).filter(Boolean);

  // data única do título, para arquivos sem coluna de data
  let dataDoArquivo: string | null = null;
  if (indice.data === undefined) {
    const datas = datasDoTitulo(linhas.slice(0, cabecalho.linha));
    if (datas.length === 0) {
      return {
        ok: false,
        erro: 'O arquivo não tem coluna de data nem o dia das vendas no título (ex.: "Data: 10/11/2026").',
        cabecalhos,
      };
    }
    if (datas.length > 1) {
      return {
        ok: false,
        erro: `O relatório soma vários dias (${dataCurta(datas[0]!)} a ${dataCurta(datas.at(-1)!)}) sem separar por dia. Exporte com a data de cada venda ou um arquivo por dia.`,
        cabecalhos,
      };
    }
    dataDoArquivo = datas[0]!;
  }

  const corpo = linhas.slice(cabecalho.linha + 1);
  // coluna ambígua ("18.350"): usa o que as outras colunas numéricas indicam; por último, o separador
  const colunasDeTexto = new Set(
    [indice.descricao, indice.codigo, indice.data].filter((c): c is number => c !== undefined),
  );
  const formatoGeral =
    formatoDoArquivo(corpo, colunasDeTexto) ?? (tabela.delimitador === ',' ? 'us' : 'br');
  const formatoDaColuna = (coluna: number | undefined): FormatoNumero =>
    (coluna === undefined ? null : detectarFormatoNumero(corpo.map((l) => l[coluna] ?? null))) ??
    formatoGeral;
  const formatoQtd = formatoDaColuna(indice.quantidade);
  const formatoValor = formatoDaColuna(indice.valor);

  const assinaturaCabecalho = linhaCabecalho.map(textoCelula).join('|');
  const descartes = new Map<string, number>();
  const descartar = (motivo: string) => descartes.set(motivo, (descartes.get(motivo) ?? 0) + 1);
  const vendas: LinhaVenda[] = [];

  for (const linha of corpo) {
    if (linha.every((c) => textoCelula(c) === '')) continue;
    if (linha.map(textoCelula).join('|') === assinaturaCabecalho) continue; // cabeçalho repetido
    if (ehLinhaDeTotal(linha)) {
      descartar('linha de total');
      continue;
    }

    const descricao = textoCelula(linha[indice.descricao!]);
    if (!descricao) {
      descartar('sem descrição');
      continue;
    }
    const quantidade = parseNumero(linha[indice.quantidade!], formatoQtd);
    if (quantidade === null) {
      descartar('quantidade inválida');
      continue;
    }
    const data = indice.data === undefined ? dataDoArquivo : parseData(linha[indice.data]);
    if (!data) {
      descartar('data inválida');
      continue;
    }

    vendas.push({
      data,
      descricao,
      codigo: indice.codigo === undefined ? null : textoCelula(linha[indice.codigo]) || null,
      quantidade,
      valor: indice.valor === undefined ? null : parseNumero(linha[indice.valor], formatoValor),
    });
  }

  if (vendas.length === 0) {
    return { ok: false, erro: 'Nenhuma linha de venda encontrada no arquivo.', cabecalhos };
  }

  const datas = vendas.map((v) => v.data).sort();
  return {
    ok: true,
    colunas,
    cabecalhos,
    linhas: vendas,
    descartadas: [...descartes].map(([motivo, n]) => ({ motivo, linhas: n })),
    periodo: { inicio: datas[0]!, fim: datas.at(-1)! },
  };
}
