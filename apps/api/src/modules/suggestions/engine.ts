// Motor de sugestão v0 — docs/PLANO-MVP.md, seção 4.
// PURO: sem banco, sem relógio do sistema (recebe `hoje`). Toda mudança exige teste.
import type { AcaoSugestao, Unidade } from '@giro/shared';

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

/** estoque = última contagem (ou 0) + compras − vendas depois da contagem; nunca negativo */
export function estimarEstoque(_entrada: EntradaEstoque): EstoqueEstimado {
  throw new Error('estimarEstoque: não implementado');
}

export function calcularSugestoes(_entrada: EntradaMotor): ResultadoItemMotor[] {
  throw new Error('calcularSugestoes: não implementado');
}
