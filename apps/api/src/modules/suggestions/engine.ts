// Motor de sugestão v0 — docs/PLANO-MVP.md, seção 4.
// PURO: sem banco, sem relógio do sistema (recebe `hoje`). Toda mudança exige teste.
import { ROTULO_UNIDADE, type AcaoSugestao, type Unidade } from '@giro/shared';
import { diaDaSemana, diferencaEmDias, somarDias } from '../../datas';

export interface VendaDia {
  /** AAAA-MM-DD */
  data: string;
  quantidade: number;
}

export interface EstoqueEstimado {
  /** nunca negativo */
  quantidade: number;
  /** sem contagem nos últimos 7 dias → "estimativa fraca" na mensagem */
  fraca: boolean;
  diasDesdeContagem: number | null;
}

export interface EntradaEstoque {
  hoje: string;
  /** última contagem do item (data = dia da contagem no fuso da loja) */
  contagem: { quantidade: number; data: string } | null;
  compras: VendaDia[];
  vendas: VendaDia[];
}

export interface EntradaItemMotor {
  itemId: number;
  nome: string;
  unidade: Unidade;
  vidaUtilDias: number;
  custoMedio: number | null;
  /** null = padrão da unidade (un: 5; kg, maço, cx: 1) */
  multiploPedido: number | null;
  /** vendas dos 28 dias antes de hoje; dia em `diasComDados` sem linha conta como 0 */
  vendas: VendaDia[];
  estoque: EstoqueEstimado;
  /** falta registrada nos últimos 28 dias → margem de 20% em vez de 10% */
  teveRuptura: boolean;
}

export interface EventoMotor {
  data: string;
  /** nome curto do evento ("feira", "feriado"); usado na explicação. Sem ele: "dia de movimento" */
  descricao?: string;
  /** multiplica a previsão do dia; vários eventos no mesmo dia se multiplicam */
  fatorDemanda: number;
}

export interface EntradaMotor {
  /** dia da sugestão (AAAA-MM-DD), no fuso da loja */
  hoje: string;
  /** dias antes de hoje cobertos por arquivo de vendas; fora deles não há dado (≠ venda zero) */
  diasComDados: string[];
  /** eventos de calendário da loja e globais que caem no horizonte */
  eventos: EventoMotor[];
  /** só itens ativos */
  itens: EntradaItemMotor[];
}

export interface ResultadoItemMotor {
  itemId: number;
  acao: AcaoSugestao;
  /** já arredondada para o múltiplo do item; 0 para skip/risk */
  quantidadeSugerida: number;
  /** forecast_qty: soma da previsão no horizonte */
  previsao: number;
  /** média da previsão por dia no horizonte */
  previsaoDiaria: number;
  horizonteDias: number;
  estoqueEstimado: number;
  /** estoque / previsão diária; null quando a previsão diária é 0 */
  diasCobertura: number | null;
  estimativaFraca: boolean;
  /** quantidadeSugerida × custoMedio (0 sem custo) — ordena os pedidos na mensagem */
  valorPedido: number;
  /** explicação curta para o dono: "tem ~15 kg, vende ~25 kg/dia, sexta vende mais" */
  motivo: string;
}

export const MOTIVO_SEM_VENDA_RECENTE = 'sem venda recente';
export const NOMES_DIA_SEMANA = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
];

const PESOS_OCORRENCIAS = [0.4, 0.3, 0.2, 0.1];
const MARGEM_PADRAO = 0.1;
const MARGEM_COM_RUPTURA = 0.2;

function arredondar(valor: number, casas: number): number {
  const f = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * f) / f;
}

function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

/** texto pt-BR do número: vírgula decimal; kg com no máximo 1 casa, demais unidades inteiras */
export function formatarQuantidade(valor: number, unidade: Unidade): string {
  const casas = unidade === 'kg' ? 1 : 0;
  const texto = arredondar(valor, casas).toFixed(casas).replace('.', ',');
  return texto.endsWith(',0') ? texto.slice(0, -2) : texto;
}

export function formatarComUnidade(valor: number, unidade: Unidade): string {
  return `${formatarQuantidade(valor, unidade)} ${ROTULO_UNIDADE[unidade]}`;
}

/** regra 12: estoque = contagem (ou 0) + compras − vendas depois da contagem; nunca negativo */
export function estimarEstoque(entrada: EntradaEstoque): EstoqueEstimado {
  const { hoje, contagem } = entrada;
  const base = contagem?.quantidade ?? 0;
  const compras = entrada.compras
    .filter((c) => (contagem ? c.data > contagem.data : true) && c.data <= hoje)
    .reduce((soma, c) => soma + c.quantidade, 0);
  const vendas = entrada.vendas
    .filter((v) => (contagem ? v.data > contagem.data : true) && v.data < hoje)
    .reduce((soma, v) => soma + v.quantidade, 0);
  const diasDesdeContagem = contagem ? diferencaEmDias(contagem.data, hoje) : null;
  return {
    quantidade: arredondar(Math.max(0, base + compras - vendas), 3),
    fraca: diasDesdeContagem === null || diasDesdeContagem > 7,
    diasDesdeContagem,
  };
}

interface ContextoPrevisao {
  hoje: string;
  /** dias com dado antes de hoje, do mais recente para o mais antigo */
  diasComDado: string[];
  vendaDoDia: Map<string, number>;
  fatorEvento: Map<string, number>;
  eventoDescricao: Map<string, string | undefined>;
}

function vendaNoDia(ctx: ContextoPrevisao, dia: string): number {
  return ctx.vendaDoDia.get(dia) ?? 0;
}

/** média dos dias com dado entre `de` e `ate` (inclusive); null se nenhum tem dado */
function mediaJanela(ctx: ContextoPrevisao, de: string, ate: string): number | null {
  return media(ctx.diasComDado.filter((d) => d >= de && d <= ate).map((d) => vendaNoDia(ctx, d)));
}

/**
 * Regra 3. Para dias futuros o corte é `hoje`; para dias já passados (usado só no teste de
 * encalhe) o corte é o próprio dia, para não comparar a venda do dia com uma base que a inclui.
 */
function base(ctx: ContextoPrevisao, dia: string): number {
  const corte = dia < ctx.hoje ? dia : ctx.hoje;
  const dow = diaDaSemana(dia);
  const ocorrencias = ctx.diasComDado
    .filter((d) => d < corte && diaDaSemana(d) === dow)
    .slice(0, PESOS_OCORRENCIAS.length)
    .map((d) => vendaNoDia(ctx, d));
  if (ocorrencias.length >= 2) {
    const pesos = PESOS_OCORRENCIAS.slice(0, ocorrencias.length);
    const somaPesos = pesos.reduce((a, b) => a + b, 0);
    // arredonda para tirar o ruído de ponto flutuante (0,4 + 0,3 + 0,2 + 0,1 = 0,9999…)
    const ponderada = ocorrencias.reduce((soma, v, i) => soma + v * (pesos[i] ?? 0), 0);
    return arredondar(ponderada / somaPesos, 9);
  }
  return mediaJanela(ctx, somarDias(corte, -14), somarDias(corte, -1)) ?? 0;
}

/** regra 4 */
function tendencia(ctx: ContextoPrevisao): number {
  const recente = mediaJanela(ctx, somarDias(ctx.hoje, -7), somarDias(ctx.hoje, -1));
  const anterior = mediaJanela(ctx, somarDias(ctx.hoje, -14), somarDias(ctx.hoje, -8));
  if (recente === null || anterior === null || anterior === 0) return 1;
  return Math.min(1.3, Math.max(0.7, recente / anterior));
}

function fatorEvento(ctx: ContextoPrevisao, dia: string): number {
  return ctx.fatorEvento.get(dia) ?? 1;
}

function quandoEvento(hoje: string, dia: string): string {
  const diff = diferencaEmDias(hoje, dia);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  return NOMES_DIA_SEMANA[diaDaSemana(dia)] ?? '';
}

function multiploPadrao(unidade: Unidade): number {
  return unidade === 'un' ? 5 : 1;
}

function arredondarParaCima(valor: number, multiplo: number): number {
  if (valor <= 0) return 0;
  return Math.ceil(arredondar(valor / multiplo, 9)) * multiplo;
}

function notaDeEvento(ctx: ContextoPrevisao, dias: string[]): string | null {
  for (const dia of dias) {
    if (fatorEvento(ctx, dia) === 1) continue;
    const nome = ctx.eventoDescricao.get(dia);
    return nome ? `${nome.toLowerCase()} ${quandoEvento(ctx.hoje, dia)}` : 'dia de movimento';
  }
  return null;
}

export function calcularSugestoes(entrada: EntradaMotor): ResultadoItemMotor[] {
  const { hoje } = entrada;
  const diasComDado = [...new Set(entrada.diasComDados)]
    .filter((d) => d < hoje)
    .sort()
    .reverse();

  const fatorEventoPorDia = new Map<string, number>();
  const descricaoPorDia = new Map<string, string | undefined>();
  for (const ev of entrada.eventos) {
    fatorEventoPorDia.set(ev.data, (fatorEventoPorDia.get(ev.data) ?? 1) * ev.fatorDemanda);
    if (ev.fatorDemanda !== 1 && !descricaoPorDia.get(ev.data)) {
      descricaoPorDia.set(ev.data, ev.descricao);
    }
  }

  return entrada.itens.map((item) => {
    const vendaDoDia = new Map<string, number>();
    for (const v of item.vendas)
      vendaDoDia.set(v.data, (vendaDoDia.get(v.data) ?? 0) + v.quantidade);
    const ctx: ContextoPrevisao = {
      hoje,
      diasComDado,
      vendaDoDia,
      fatorEvento: fatorEventoPorDia,
      eventoDescricao: descricaoPorDia,
    };

    const horizonte = Math.floor(Math.min(3, Math.max(1, item.vidaUtilDias)));
    const dias = Array.from({ length: horizonte }, (_, i) => somarDias(hoje, i));
    const fatorTendencia = tendencia(ctx);
    const previsao = dias.reduce(
      (soma, d) => soma + base(ctx, d) * fatorTendencia * fatorEvento(ctx, d),
      0,
    );
    const previsaoDiaria = previsao / horizonte;
    const estoque = item.estoque.quantidade;
    const cobertura = previsaoDiaria === 0 ? null : estoque / previsaoDiaria;

    // regra 8: encalhe
    const ontem = somarDias(hoje, -1);
    const anteontem = somarDias(hoje, -2);
    const temDadoRecente = diasComDado.includes(ontem) && diasComDado.includes(anteontem);
    const vendido2Dias = vendaNoDia(ctx, ontem) + vendaNoDia(ctx, anteontem);
    const esperado2Dias =
      base(ctx, ontem) * fatorEvento(ctx, ontem) +
      base(ctx, anteontem) * fatorEvento(ctx, anteontem);
    const risco = temDadoRecente && vendido2Dias < 0.6 * esperado2Dias && estoque > previsao;

    const tem = `tem ~${formatarComUnidade(estoque, item.unidade)}`;
    let acao: ResultadoItemMotor['acao'];
    let quantidadeSugerida = 0;
    let motivo: string;

    if (risco) {
      acao = 'risk';
      motivo = `vendendo abaixo do ritmo, ${tem}`;
    } else if (cobertura === null || arredondar(cobertura, 9) >= horizonte) {
      acao = 'skip';
      motivo =
        cobertura === null ? MOTIVO_SEM_VENDA_RECENTE : `estoque p/ ${Math.floor(cobertura)} dias`;
    } else {
      const margem = item.teveRuptura ? MARGEM_COM_RUPTURA : MARGEM_PADRAO;
      const multiplo = item.multiploPedido ?? multiploPadrao(item.unidade);
      quantidadeSugerida = arredondarParaCima(previsao * (1 + margem) - estoque, multiplo);
      if (quantidadeSugerida === 0) {
        acao = 'skip';
        motivo = 'estoque dá para hoje';
      } else {
        acao = 'order';
        const partes = [tem, `vende ~${formatarComUnidade(previsaoDiaria, item.unidade)}/dia`];
        const bases = Array.from({ length: 7 }, (_, i) => base(ctx, somarDias(hoje, i)));
        const mediaBases = media(bases) ?? 0;
        if (mediaBases > 0 && base(ctx, hoje) >= 1.2 * mediaBases) {
          partes.push(`${NOMES_DIA_SEMANA[diaDaSemana(hoje)]} vende mais`);
        }
        const nota = notaDeEvento(ctx, dias);
        if (nota) partes.push(nota);
        motivo = partes.join(', ');
      }
    }

    return {
      itemId: item.itemId,
      acao,
      quantidadeSugerida,
      previsao: arredondar(previsao, 3),
      previsaoDiaria: arredondar(previsaoDiaria, 3),
      horizonteDias: horizonte,
      estoqueEstimado: arredondar(estoque, 3),
      diasCobertura: cobertura === null ? null : arredondar(cobertura, 3),
      estimativaFraca: item.estoque.fraca,
      valorPedido: arredondar(quantidadeSugerida * (item.custoMedio ?? 0), 2),
      motivo,
    };
  });
}
