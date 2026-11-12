// Mensagem diária para o dono — docs/PLANO-MVP.md, seção 5.5. Pura.
import type { Canal, Unidade } from '@giro/shared';
import { diaDaSemana } from '../../datas';
import { MOTIVO_SEM_VENDA_RECENTE, formatarComUnidade, type ResultadoItemMotor } from './engine';

/** linhas de encalhe + pedidos na mensagem; o resto vira "responda tudo para ver" */
export const LIMITE_ITENS_MENSAGEM = 12;

export interface ItemParaMensagem extends ResultadoItemMotor {
  nome: string;
  unidade: Unidade;
}

export interface ItemOrdenado extends ItemParaMensagem {
  /** número do pedido (1..N, por valor decrescente); null para encalhe e não repor */
  posicao: number | null;
}

const porNome = (a: ItemParaMensagem, b: ItemParaMensagem) => a.nome.localeCompare(b.nome, 'pt-BR');

/** encalhes primeiro, depois pedidos por valor (posições 1..N), depois não repor */
export function ordenarParaMensagem(itens: ItemParaMensagem[]): ItemOrdenado[] {
  const encalhes = itens.filter((i) => i.acao === 'risk').sort(porNome);
  const pedidos = itens
    .filter((i) => i.acao === 'order')
    .sort((a, b) => b.valorPedido - a.valorPedido || porNome(a, b));
  const naoRepor = itens.filter((i) => i.acao === 'skip').sort(porNome);
  return [
    ...encalhes.map((i) => ({ ...i, posicao: null })),
    ...pedidos.map((i, idx) => ({ ...i, posicao: idx + 1 })),
    ...naoRepor.map((i) => ({ ...i, posicao: null })),
  ];
}

export interface EntradaMensagem {
  nomeDono: string;
  /** dia da sugestão, AAAA-MM-DD */
  data: string;
  /** no canal manual a mensagem termina com "Responda ok para aceitar…" (os botões não existem) */
  canal: Canal;
  itens: ItemOrdenado[];
}

const DIAS_ABREVIADOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MARCA_FRACA = ' *';
const NOTA_FRACA =
  '* estoque estimado sem contagem recente. Mande /estoque item qtd para corrigir.';
const LINHA_MANUAL =
  'Responda *ok* para aceitar, ou o número e a quantidade para ajustar (ex.: 1 35).';

/** "2026-11-12" → "qui 12/11" */
export function formatarDataCurta(data: string): string {
  const [, mes, dia] = data.split('-');
  return `${DIAS_ABREVIADOS[diaDaSemana(data)]} ${dia}/${mes}`;
}

/** na linha do pedido a unidade já aparece na quantidade: "tem ~15 kg" → "tem ~15" */
function motivoSemUnidade(motivo: string): string {
  return motivo.replace(/(~\d+(?:,\d+)?) (?:kg|un|maço|cx)/g, '$1');
}

export function gerarMensagem(entrada: EntradaMensagem): string {
  const manual = entrada.canal === 'manual';
  const encalhes = entrada.itens.filter((i) => i.acao === 'risk');
  const pedidos = entrada.itens.filter((i) => i.acao === 'order');
  const naoRepor = entrada.itens.filter((i) => i.acao === 'skip');

  // o limite vale para encalhe + pedido; encalhes nunca são cortados
  const vagasPedido = Math.max(0, LIMITE_ITENS_MENSAGEM - encalhes.length);
  const pedidosVisiveis = pedidos.slice(0, vagasPedido);
  const pedidosOcultos = pedidos.length - pedidosVisiveis.length;

  let temFraca = false;
  const marca = (i: ItemOrdenado) => {
    if (!i.estimativaFraca) return '';
    temFraca = true;
    return MARCA_FRACA;
  };

  const blocos: string[] = [
    `Bom dia, ${entrada.nomeDono}! Sugestão de hoje (${formatarDataCurta(entrada.data)}):`,
  ];

  if (encalhes.length > 0) {
    blocos.push(
      encalhes.map((i) => `⚠️ ${i.nome}: ${i.motivo}. Vale promoção hoje.${marca(i)}`).join('\n'),
    );
  }

  const linhasPedido = ['PEDIR'];
  if (pedidos.length === 0) {
    linhasPedido.push('Nada para pedir hoje.');
  } else {
    for (const i of pedidosVisiveis) {
      linhasPedido.push(
        `${i.posicao}. ${i.nome} — ${formatarComUnidade(i.quantidadeSugerida, i.unidade)} (${motivoSemUnidade(i.motivo)})${marca(i)}`,
      );
    }
    if (pedidosOcultos > 0) {
      const tudo = manual ? '*tudo*' : 'tudo';
      const itens = pedidosOcultos === 1 ? 'item' : 'itens';
      linhasPedido.push(
        `… e mais ${pedidosOcultos} ${itens} para pedir — responda ${tudo} para ver.`,
      );
    }
  }
  blocos.push(linhasPedido.join('\n'));

  if (naoRepor.length > 0) {
    const nomes = naoRepor.map((i) => {
      const detalhe = i.motivo === MOTIVO_SEM_VENDA_RECENTE ? '' : ` (${i.motivo})`;
      return `${i.nome}${detalhe}${marca(i)}`;
    });
    blocos.push(`NÃO REPOR HOJE\n${nomes.join(', ')}`);
  }

  if (temFraca) blocos.push(NOTA_FRACA);
  if (manual) blocos.push(LINHA_MANUAL);
  return blocos.join('\n\n');
}
