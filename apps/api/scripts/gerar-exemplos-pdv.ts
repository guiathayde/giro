/**
 * Gera os arquivos de exemplo de exportação de PDV usados nos testes e para testar o bot.
 * Não editar os arquivos gerados à mão: mude este script e rode `pnpm --filter @giro/api fixtures:pdv`.
 *
 * Não existe layout público de exportação dos PDVs de hortifruti (ver docs/DECISIONS.md),
 * então o exemplo é sintético, com os traços típicos dos relatórios brasileiros:
 * separador `;`, vírgula decimal, Windows-1252, CRLF, linhas de título antes da tabela,
 * linha de TOTAL GERAL no fim, peso com 3 casas, itens de mercearia misturados,
 * produto repetido no mesmo dia (troca de preço) e devolução com quantidade negativa.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const PASTA = fileURLToPath(new URL('../test/fixtures/pdv/', import.meta.url));

// ---------- dados ----------

interface ProdutoPdv {
  codigo: string;
  descricao: string;
  un: 'KG' | 'UN' | 'MC' | 'CX';
  preco: number;
  base: number; // venda média por dia
  chanceVenda?: number; // probabilidade de ter venda no dia
}

const PRODUTOS: ProdutoPdv[] = [
  { codigo: '1001', descricao: 'TOMATE KG', un: 'KG', preco: 8.99, base: 22 },
  { codigo: '1002', descricao: 'TOMATE CARMEN KG', un: 'KG', preco: 9.49, base: 6 },
  { codigo: '1003', descricao: 'CEBOLA KG', un: 'KG', preco: 5.49, base: 11 },
  { codigo: '1004', descricao: 'BATATA LISA KG', un: 'KG', preco: 6.49, base: 14 },
  { codigo: '1005', descricao: 'CENOURA KG', un: 'KG', preco: 5.99, base: 7 },
  { codigo: '1006', descricao: 'ALFACE CRESPA UN', un: 'UN', preco: 3.49, base: 35 },
  { codigo: '1007', descricao: 'BANANA NANICA KG', un: 'KG', preco: 5.49, base: 25 },
  { codigo: '1008', descricao: 'BANANA PRATA KG', un: 'KG', preco: 7.99, base: 12 },
  { codigo: '1009', descricao: 'MAMÃO FORMOSA KG', un: 'KG', preco: 6.99, base: 9 },
  { codigo: '1010', descricao: 'LARANJA PERA KG', un: 'KG', preco: 4.49, base: 18 },
  { codigo: '1011', descricao: 'Limão Taiti kg', un: 'KG', preco: 5.99, base: 6 },
  { codigo: '1012', descricao: 'MAÇÃ GALA KG', un: 'KG', preco: 11.99, base: 8 },
  { codigo: '1013', descricao: 'ABACAXI PEROLA UN', un: 'UN', preco: 7.99, base: 10 },
  { codigo: '1014', descricao: 'MELANCIA KG', un: 'KG', preco: 3.49, base: 20, chanceVenda: 0.8 },
  { codigo: '1015', descricao: 'PIMENTAO VERDE KG', un: 'KG', preco: 8.99, base: 3 },
  { codigo: '1016', descricao: 'ABOBRINHA ITALIANA KG', un: 'KG', preco: 6.49, base: 5 },
  { codigo: '1017', descricao: 'PEPINO JAPONES KG', un: 'KG', preco: 7.49, base: 4 },
  { codigo: '1018', descricao: 'CHUCHU KG', un: 'KG', preco: 4.99, base: 4 },
  { codigo: '1019', descricao: 'COUVE MANTEIGA MC', un: 'MC', preco: 3.99, base: 12 },
  { codigo: '1020', descricao: 'CHEIRO VERDE MC', un: 'MC', preco: 2.99, base: 15 },
  { codigo: '1021', descricao: 'TOMATE CEREJA 300G', un: 'CX', preco: 6.99, base: 6 },
  // hortifruti que ainda não está no catálogo da loja
  { codigo: '1030', descricao: 'BATATA DOCE KG', un: 'KG', preco: 5.99, base: 5 },
  {
    codigo: '1031',
    descricao: 'MANGA PALMER KG',
    un: 'KG',
    preco: 7.99,
    base: 6,
    chanceVenda: 0.7,
  },
  // mercearia: não é FLV, o operador vai marcar como "ignorar"
  { codigo: '7891234560012', descricao: 'OVOS BRANCOS GRANDES DZ', un: 'UN', preco: 12.9, base: 8 },
  { codigo: '7894900011517', descricao: 'AGUA MINERAL 500ML', un: 'UN', preco: 2.5, base: 14 },
  {
    codigo: '9001',
    descricao: 'SACOLA PLASTICA',
    un: 'UN',
    preco: 0.1,
    base: 60,
    chanceVenda: 0.95,
  },
];

// segunda a domingo
const FATOR_DIA_SEMANA = [0.9, 0.85, 0.95, 1.0, 1.25, 1.4, 0.6];
const FERIADOS = new Set(['2026-10-12', '2026-11-02']); // N. Sra. Aparecida, Finados
const INICIO = '2026-10-12'; // segunda
const DIAS = 28; // até 2026-11-08 (domingo)

// ---------- utilitários ----------

function mulberry32(semente: number) {
  let a = semente;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const aleatorio = mulberry32(20261112);

function somarDias(isoData: string, dias: number): string {
  const d = new Date(`${isoData}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
function diaSemanaSegundaZero(isoData: string): number {
  return (new Date(`${isoData}T00:00:00Z`).getUTCDay() + 6) % 7;
}
function arredondar(valor: number, casas: number): number {
  const f = 10 ** casas;
  return Math.round(valor * f) / f;
}
function formatarBr(valor: number, casas: number): string {
  const [inteiro = '0', decimal] = Math.abs(valor).toFixed(casas).split('.');
  const comMilhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${valor < 0 ? '-' : ''}${comMilhar}${decimal ? `,${decimal}` : ''}`;
}
function dataBr(isoData: string): string {
  const [a, m, d] = isoData.split('-');
  return `${d}/${m}/${a}`;
}
/** serial do Excel (sistema 1900) sem passar por fuso horário */
function serialExcel(isoData: string): number {
  return Math.round((Date.parse(`${isoData}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

// ---------- geração das linhas ----------

interface Linha {
  data: string;
  produto: ProdutoPdv;
  qtde: number;
  unit: number;
  total: number;
}

const linhas: Linha[] = [];

function adicionar(data: string, produto: ProdutoPdv, qtde: number, unit = produto.preco) {
  linhas.push({ data, produto, qtde, unit, total: arredondar(qtde * unit, 2) });
}

for (let i = 0; i < DIAS; i++) {
  const data = somarDias(INICIO, i);
  const fator =
    (FATOR_DIA_SEMANA[diaSemanaSegundaZero(data)] ?? 1) * (FERIADOS.has(data) ? 0.5 : 1);

  for (const produto of PRODUTOS) {
    if (aleatorio() > (produto.chanceVenda ?? 1)) continue;
    const bruto = produto.base * fator * (0.8 + aleatorio() * 0.4);
    const qtde = produto.un === 'KG' ? arredondar(bruto, 3) : Math.max(1, Math.round(bruto));

    // troca de preço da banana nanica no meio do dia 30/10: duas linhas no mesmo dia
    if (produto.codigo === '1007' && data === '2026-10-30') {
      const manha = arredondar(qtde * 0.4, 3);
      adicionar(data, produto, manha, 5.49);
      adicionar(data, produto, arredondar(qtde - manha, 3), 4.99);
      continue;
    }
    const preco = produto.codigo === '1007' && data > '2026-10-30' ? 4.99 : produto.preco;
    adicionar(data, produto, qtde, preco);
  }

  // devolução de tomate em 20/10
  if (data === '2026-10-20') adicionar(data, PRODUTOS[0]!, -1.25);
}

// ---------- CSV (Windows-1252, ;) ----------

const totalQtde = arredondar(
  linhas.reduce((s, l) => s + l.qtde, 0),
  3,
);
const totalValor = arredondar(
  linhas.reduce((s, l) => s + l.total, 0),
  2,
);

const csv = [
  'HORTIFRUTI BOM PRECO LTDA - CNPJ 00.000.000/0001-00',
  'RELATÓRIO DE VENDAS POR PRODUTO - ANALÍTICO POR DIA',
  `Período: ${dataBr(INICIO)} a ${dataBr(somarDias(INICIO, DIAS - 1))}`,
  `Emitido em ${dataBr(somarDias(INICIO, DIAS))} 07:41:12 por CAIXA01`,
  '',
  'Data;Código;Descrição;Un;Qtde;Vl. Unit.;Vl. Total',
  ...linhas.map((l) =>
    [
      dataBr(l.data),
      l.produto.codigo,
      l.produto.descricao,
      l.produto.un,
      formatarBr(l.qtde, l.produto.un === 'KG' ? 3 : 0),
      formatarBr(l.unit, 2),
      formatarBr(l.total, 2),
    ].join(';'),
  ),
  '',
  `;;TOTAL GERAL (${linhas.length} registros);;${formatarBr(totalQtde, 3)};;${formatarBr(totalValor, 2)}`,
  '',
].join('\r\n');

writeFileSync(`${PASTA}vendas-por-produto-28-dias.csv`, Buffer.from(csv, 'latin1'));

// ---------- XLSX e XLS (mesmos dados, células numéricas e de data) ----------

const celulaData = (iso: string): XLSX.CellObject => ({
  t: 'n',
  v: serialExcel(iso),
  z: 'dd/mm/yyyy',
});
const aoa: (XLSX.CellObject | string | number | null)[][] = [
  ['HORTIFRUTI BOM PRECO LTDA'],
  ['Relatório de Vendas por Produto - Analítico por Dia'],
  [`Período: ${dataBr(INICIO)} a ${dataBr(somarDias(INICIO, DIAS - 1))}`],
  [],
  ['Data', 'Código', 'Descrição', 'Un', 'Qtde', 'Vl. Unit.', 'Vl. Total'],
  ...linhas.map((l) => [
    celulaData(l.data),
    l.produto.codigo,
    l.produto.descricao,
    l.produto.un,
    l.qtde,
    l.unit,
    l.total,
  ]),
  [null, null, 'TOTAL GERAL', null, totalQtde, null, totalValor],
];
const planilha = XLSX.utils.aoa_to_sheet(aoa);
const pasta = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(pasta, planilha, 'Vendas');
writeFileSync(
  `${PASTA}vendas-por-produto-28-dias.xlsx`,
  XLSX.write(pasta, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer,
);

// .xls antigo (BIFF8), formato que muitos PDVs ainda exportam
writeFileSync(
  `${PASTA}vendas-por-produto-28-dias.xls`,
  XLSX.write(pasta, { type: 'buffer', bookType: 'biff8' }) as Buffer,
);

// ---------- CSV de um dia, de outro sistema: UTF-8 com BOM, vírgula, ponto decimal, sem coluna de data ----------

const umDia = [
  'Relatório de produtos vendidos',
  'Loja: Hortifruti Bom Preço',
  'Data: 10/11/2026',
  'Gerado em: 11/11/2026 06:30',
  '',
  'Produto,Qtd Vendida,Valor Total (R$)',
  'Tomate KG,23.415,210.50',
  '"Banana nanica, kg",27.8,138.72',
  'Alface crespa UN,31,108.19',
  'Cebola KG,9.350,51.33',
  'Manga Palmer KG,4.1,32.76',
  'Total,,541.50',
  '',
].join('\n');
writeFileSync(`${PASTA}vendas-dia-sem-coluna-data.csv`, `\uFEFF${umDia}`, 'utf8');

console.log(
  `gerados em ${PASTA}: ${linhas.length} linhas, qtde total ${formatarBr(totalQtde, 3)}, valor total ${formatarBr(totalValor, 2)}`,
);
