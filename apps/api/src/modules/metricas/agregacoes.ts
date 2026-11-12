// Agregações das métricas do piloto. Funções puras: recebem linhas já lidas do banco.
import type { MetricasLoja, MotivoResposta, Unidade } from '@giro/shared';
import { MOTIVOS_RESPOSTA } from '@giro/shared';
import { diferencaEmDias, inicioDaSemana, somarDias } from '../../datas';

export interface SugestaoEnviada {
  id: number;
  /** suggestion_date */
  data: string;
  enviadoEm: Date;
}

export interface ItemDeSugestao {
  sugestaoId: number;
  /** suggestion_date da sugestão */
  data: string;
  itemNome: string;
  acao: 'order' | 'skip' | 'risk';
  resposta: 'accepted' | 'adjusted' | 'ignored' | null;
  motivo: MotivoResposta | null;
  nota: string | null;
  respondidoEm: Date | null;
}

export interface PerdaLinha {
  itemId: number;
  itemNome: string;
  unidade: Unidade;
  data: string;
  quantidade: number;
  valor: number | null;
}

export interface RupturaLinha {
  data: string;
}

export interface Periodo {
  inicio: string;
  fim: string;
}

/** percentual com 1 casa; null quando o denominador é 0 */
export function percentual(parte: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((parte / total) * 1000) / 10;
}

export function arredondar(valor: number, casas: number): number {
  const f = 10 ** casas;
  return Math.round(valor * f) / f;
}

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 1
    ? ordenados[meio]!
    : (ordenados[meio - 1]! + ordenados[meio]!) / 2;
}

/** segundas-feiras das semanas que tocam o período */
export function semanasDoPeriodo(periodo: Periodo): string[] {
  const semanas: string[] = [];
  for (let s = inicioDaSemana(periodo.inicio); s <= periodo.fim; s = somarDias(s, 7)) {
    semanas.push(s);
  }
  return semanas;
}

const dentro = (data: string, p: Periodo) => data >= p.inicio && data <= p.fim;

export function calcularAdesao(
  sugestoes: SugestaoEnviada[],
  itens: ItemDeSugestao[],
): MetricasLoja['adesao'] {
  const enviadas = new Set(sugestoes.map((s) => s.id));
  const doPedido = itens.filter((i) => enviadas.has(i.sugestaoId) && i.acao === 'order');
  const comResposta = new Set(
    itens.filter((i) => enviadas.has(i.sugestaoId) && i.respondidoEm).map((i) => i.sugestaoId),
  );
  const contar = (r: ItemDeSugestao['resposta']) => doPedido.filter((i) => i.resposta === r).length;
  const aceitos = contar('accepted');
  const ajustados = contar('adjusted');
  return {
    diasComSugestaoEnviada: sugestoes.length,
    diasRespondidos: comResposta.size,
    percentualDiasRespondidos: percentual(comResposta.size, sugestoes.length),
    itens: {
      total: doPedido.length,
      aceitos,
      ajustados,
      ignorados: contar('ignored'),
      semResposta: contar(null),
    },
    percentualAceitosOuAjustados: percentual(aceitos + ajustados, doPedido.length),
  };
}

export function calcularTempoResposta(
  sugestoes: SugestaoEnviada[],
  itens: ItemDeSugestao[],
): MetricasLoja['tempoResposta'] {
  const minutos: number[] = [];
  for (const s of sugestoes) {
    const respostas = itens
      .filter((i) => i.sugestaoId === s.id && i.respondidoEm)
      .map((i) => i.respondidoEm!.getTime());
    if (respostas.length === 0) continue;
    minutos.push((Math.min(...respostas) - s.enviadoEm.getTime()) / 60_000);
  }
  const med = mediana(minutos);
  return {
    respostas: minutos.length,
    medianaMinutos: med === null ? null : arredondar(med, 1),
    percentualAte2h: percentual(minutos.filter((m) => m <= 120).length, minutos.length),
  };
}

/** `datasComVendas` pode ter repetidas (uma por item); conta dias distintos */
export function calcularArquivos(
  datasComVendas: string[],
  periodo: Periodo,
): MetricasLoja['arquivos'] {
  const distintas = new Set(datasComVendas.filter((d) => dentro(d, periodo)));
  return semanasDoPeriodo(periodo).map((semana) => {
    const ini = semana < periodo.inicio ? periodo.inicio : semana;
    const fimSemana = somarDias(semana, 6);
    const fim = fimSemana > periodo.fim ? periodo.fim : fimSemana;
    let diasComVendas = 0;
    for (const d of distintas) if (d >= ini && d <= fim) diasComVendas++;
    return { semana, diasComVendas, diasNoPeriodo: diferencaEmDias(ini, fim) + 1 };
  });
}

export function calcularPerdasSemanas(
  perdas: PerdaLinha[],
  periodo: Periodo,
): MetricasLoja['perdas']['semanas'] {
  const mapa = new Map(
    semanasDoPeriodo(periodo).map((s) => [s, { semana: s, kg: 0, valor: 0, registros: 0 }]),
  );
  for (const p of perdas) {
    if (!dentro(p.data, periodo)) continue;
    const linha = mapa.get(inicioDaSemana(p.data))!;
    if (p.unidade === 'kg') linha.kg += p.quantidade;
    linha.valor += p.valor ?? 0;
    linha.registros += 1;
  }
  return [...mapa.values()].map((l) => ({
    ...l,
    kg: arredondar(l.kg, 3),
    valor: arredondar(l.valor, 2),
  }));
}

/**
 * "antes": 7 dias a partir da primeira venda importada, só se terminar antes do início das
 * sugestões (ou se nunca houve sugestão enviada). "durante": do início das sugestões até o
 * fim do período, em média por semana. A janela que não se aplica fica null.
 */
export function calcularPerdasPorItem(
  perdas: PerdaLinha[],
  entrada: { primeiraVenda: string | null; inicioSugestoes: string | null; fimPeriodo: string },
): MetricasLoja['perdas']['porItem'] {
  const { primeiraVenda, inicioSugestoes, fimPeriodo } = entrada;

  let antes: Periodo | null = null;
  if (primeiraVenda) {
    const fimAntes = somarDias(primeiraVenda, 6);
    if (inicioSugestoes === null || fimAntes < inicioSugestoes) {
      antes = { inicio: primeiraVenda, fim: fimAntes };
    }
  }
  const durante: Periodo | null =
    inicioSugestoes !== null && inicioSugestoes <= fimPeriodo
      ? { inicio: inicioSugestoes, fim: fimPeriodo }
      : null;
  const semanasDurante = durante ? (diferencaEmDias(durante.inicio, durante.fim) + 1) / 7 : 1;

  interface Soma {
    quantidade: number;
    valor: number;
  }
  const porItem = new Map<number, { nome: string; unidade: Unidade; antes: Soma; durante: Soma }>();
  for (const p of perdas) {
    const noAntes = antes !== null && dentro(p.data, antes);
    const noDurante = durante !== null && dentro(p.data, durante);
    if (!noAntes && !noDurante) continue;
    let linha = porItem.get(p.itemId);
    if (!linha) {
      linha = {
        nome: p.itemNome,
        unidade: p.unidade,
        antes: { quantidade: 0, valor: 0 },
        durante: { quantidade: 0, valor: 0 },
      };
      porItem.set(p.itemId, linha);
    }
    // as janelas nunca se sobrepõem (antes termina antes do início das sugestões)
    const alvo = noAntes ? linha.antes : linha.durante;
    alvo.quantidade += p.quantidade;
    alvo.valor += p.valor ?? 0;
  }

  const media = (s: Soma, semanas: number) => ({
    quantidade: arredondar(s.quantidade / semanas, 3),
    valor: arredondar(s.valor / semanas, 2),
  });
  return [...porItem.entries()]
    .map(([itemId, l]) => ({
      itemId,
      itemNome: l.nome,
      unidade: l.unidade,
      antesPorSemana: antes ? media(l.antes, 1) : null,
      durantePorSemana: durante ? media(l.durante, semanasDurante) : null,
    }))
    .sort((a, b) => a.itemNome.localeCompare(b.itemNome, 'pt-BR'));
}

export function calcularRupturas(
  rupturas: RupturaLinha[],
  periodo: Periodo,
): MetricasLoja['rupturas'] {
  const mapa = new Map(semanasDoPeriodo(periodo).map((s) => [s, 0]));
  for (const r of rupturas) {
    if (!dentro(r.data, periodo)) continue;
    const semana = inicioDaSemana(r.data);
    mapa.set(semana, (mapa.get(semana) ?? 0) + 1);
  }
  return [...mapa.entries()].map(([semana, quantidade]) => ({ semana, quantidade }));
}

/** motivos dos itens ajustados, do mais citado ao menos; só os que aparecem */
export function calcularMotivosAjuste(itens: ItemDeSugestao[]): MetricasLoja['motivosAjuste'] {
  const contagem = new Map<MotivoResposta, number>();
  for (const i of itens) {
    if (i.resposta !== 'adjusted' || !i.motivo) continue;
    contagem.set(i.motivo, (contagem.get(i.motivo) ?? 0) + 1);
  }
  return MOTIVOS_RESPOSTA.filter((m) => contagem.has(m))
    .map((motivo) => ({ motivo, quantidade: contagem.get(motivo)! }))
    .sort((a, b) => b.quantidade - a.quantidade);
}

export function calcularNotasAjuste(itens: ItemDeSugestao[]): MetricasLoja['notasAjuste'] {
  return itens
    .filter((i) => i.nota !== null && i.nota.trim() !== '')
    .map((i) => ({ data: i.data, itemNome: i.itemNome, nota: i.nota! }))
    .sort((a, b) => a.data.localeCompare(b.data) || a.itemNome.localeCompare(b.itemNome, 'pt-BR'));
}
