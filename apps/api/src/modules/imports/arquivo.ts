// Leitura do arquivo exportado do PDV para uma tabela de células. Puro (sem I/O).
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';

/** Célula lida do arquivo. Datas de planilha viram texto 'AAAA-MM-DD' (sem fuso horário). */
export type Celula = string | number | null;

export type FormatoArquivo = 'csv' | 'planilha';

export interface Tabela {
  formato: FormatoArquivo;
  /** separador detectado no CSV; ajuda a decidir o formato dos números */
  delimitador?: string;
  linhas: Celula[][];
}

export const EXTENSOES_ACEITAS = ['.csv', '.txt', '.xlsx', '.xls'] as const;

export function extensaoAceita(nomeArquivo: string): boolean {
  const nome = nomeArquivo.toLowerCase();
  return EXTENSOES_ACEITAS.some((ext) => nome.endsWith(ext));
}

export function lerTabela(conteudo: Uint8Array, nomeArquivo: string): Tabela {
  return ehPlanilha(conteudo, nomeArquivo) ? lerPlanilha(conteudo) : lerCsv(conteudo);
}

function ehPlanilha(conteudo: Uint8Array, nomeArquivo: string): boolean {
  const nome = nomeArquivo.toLowerCase();
  if (nome.endsWith('.xlsx') || nome.endsWith('.xls')) return true;
  if (nome.endsWith('.csv') || nome.endsWith('.txt')) return false;
  // sem extensão conhecida: olha a assinatura (zip = xlsx, OLE2 = xls)
  const zip = conteudo[0] === 0x50 && conteudo[1] === 0x4b;
  const ole = conteudo[0] === 0xd0 && conteudo[1] === 0xcf && conteudo[2] === 0x11;
  return zip || ole;
}

// ---------- CSV ----------

/** UTF-8 quando válido; senão Windows-1252, o padrão dos sistemas brasileiros no Windows. */
export function decodificarTexto(bytes: Uint8Array): string {
  const semBom =
    bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(semBom);
  } catch {
    return new TextDecoder('windows-1252').decode(semBom);
  }
}

const DELIMITADORES = [';', ',', '\t', '|'] as const;

function contarForaDeAspas(linha: string, caractere: string): number {
  let total = 0;
  let emAspas = false;
  for (const c of linha) {
    if (c === '"') emAspas = !emAspas;
    else if (c === caractere && !emAspas) total++;
  }
  return total;
}

/**
 * Escolhe o separador que aparece o mesmo número de vezes no maior número de linhas.
 * Vírgula decimal faz a contagem de ',' variar entre linhas, então ';' ganha nos CSVs brasileiros.
 */
export function detectarDelimitador(texto: string): string {
  const amostra = texto
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, 50);
  let melhor: { delimitador: string; pontos: number } = { delimitador: ';', pontos: 0 };

  for (const delimitador of DELIMITADORES) {
    const frequencia = new Map<number, number>();
    for (const linha of amostra) {
      const n = contarForaDeAspas(linha, delimitador);
      if (n > 0) frequencia.set(n, (frequencia.get(n) ?? 0) + 1);
    }
    const pontos = Math.max(0, ...frequencia.values());
    if (pontos > melhor.pontos) melhor = { delimitador, pontos };
  }
  return melhor.delimitador;
}

function lerCsv(conteudo: Uint8Array): Tabela {
  const texto = decodificarTexto(conteudo);
  const delimitador = detectarDelimitador(texto);
  const registros: string[][] = parse(texto, {
    delimiter: delimitador,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    trim: true,
  });
  return {
    formato: 'csv',
    delimitador,
    linhas: registros.map((r) => r.map((c) => (c === '' ? null : c))),
  };
}

// ---------- XLSX / XLS ----------

// as tipagens do SheetJS declaram SSF como any
const SSF = XLSX.SSF as {
  is_date: (formato: string) => boolean;
  parse_date_code: (serial: number) => { y: number; m: number; d: number };
};

function lerPlanilha(conteudo: Uint8Array): Tabela {
  const pasta = XLSX.read(conteudo, { type: 'array', cellDates: false, cellNF: true });
  const nomeAba = pasta.SheetNames[0];
  const aba = nomeAba ? pasta.Sheets[nomeAba] : undefined;
  if (!aba?.['!ref']) return { formato: 'planilha', linhas: [] };

  const faixa = XLSX.utils.decode_range(aba['!ref']);
  const linhas: Celula[][] = [];
  for (let r = faixa.s.r; r <= faixa.e.r; r++) {
    const linha: Celula[] = [];
    for (let c = faixa.s.c; c <= faixa.e.c; c++) {
      linha.push(valorCelula(aba[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined));
    }
    if (linha.some((v) => v !== null)) linhas.push(linha);
  }
  return { formato: 'planilha', linhas };
}

function valorCelula(celula: XLSX.CellObject | undefined): Celula {
  if (!celula) return null;
  switch (celula.t) {
    case 'n': {
      const valor = celula.v as number;
      if (typeof celula.z === 'string' && SSF.is_date(celula.z)) {
        const d = SSF.parse_date_code(valor);
        return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
      }
      return valor;
    }
    case 's':
    case 'b': {
      const texto = String(celula.v).trim();
      return texto === '' ? null : texto;
    }
    case 'd':
      return celula.v instanceof Date ? celula.v.toISOString().slice(0, 10) : null;
    default:
      return null;
  }
}
