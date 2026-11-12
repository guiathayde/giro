// Textos que o bot manda para o dono. Puros, em português simples.
import {
  ROTULO_MOTIVO_RESPOSTA,
  ROTULO_UNIDADE,
  type Item,
  type ItemSugestao,
  type MotivoResposta,
  type ResumoImportacao,
  type Unidade,
} from '@giro/shared';
import { EXTENSOES_ACEITAS } from '../imports/arquivo';
import { TAMANHO_MAXIMO_ARQUIVO } from '../imports/limites';
import type { LojaDoChat } from '../stores/service';

export const MENSAGEM_BOAS_VINDAS =
  'Olá! Aqui é o Giro. Para começar, abra o link de vinculação que o operador te mandou.';

export const MENSAGEM_CODIGO_INVALIDO =
  'Não reconheci esse código de vinculação. Peça um link novo ao operador.';

export const MENSAGEM_CHAT_SEM_LOJA =
  'Ainda não sei de qual loja é este chat. Abra o link de vinculação que o operador te mandou e depois mande o arquivo de novo.';

export const MENSAGEM_FORMATO_INVALIDO = `Só consigo ler arquivo CSV ou Excel (${EXTENSOES_ACEITAS.join(', ')}). Exporte as vendas do PDV num desses formatos e mande de novo.`;

export const MENSAGEM_ARQUIVO_GRANDE = `Esse arquivo é grande demais (máximo ${TAMANHO_MAXIMO_ARQUIVO / 1024 / 1024} MB).`;

export const MENSAGEM_FALHA_PROCESSAMENTO =
  'Tive um problema para processar o arquivo. Tente de novo daqui a pouco; se continuar, avise o operador.';

export function mensagemVinculado(loja: LojaDoChat): string {
  return `Pronto, ${loja.nomeDono}! Este chat agora é da loja ${loja.nome}. Quando quiser, me mande aqui o arquivo de vendas exportado do PDV.`;
}

export function mensagemJaVinculado(loja: LojaDoChat): string {
  return `Olá, ${loja.nomeDono}! Este chat é da loja ${loja.nome}. Pode me mandar aqui o arquivo de vendas exportado do PDV.`;
}

const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const inteiro = (n: number) => n.toLocaleString('pt-BR');

/** "recebi, 142 linhas, 3 itens que não reconheci (o operador vai mapear)" — seção 5.2 do plano */
export function mensagemImportacao({ importacao, naoMapeados }: ResumoImportacao): string {
  if (importacao.status === 'error') {
    return `Não consegui ler esse arquivo: ${importacao.erro ?? 'erro desconhecido'} O operador vai dar uma olhada.`;
  }

  const { inicioPeriodo: inicio, fimPeriodo: fim, linhasTotal } = importacao;
  const periodo =
    inicio && fim
      ? inicio === fim
        ? ` do dia ${diaMes(inicio)}`
        : ` de ${diaMes(inicio)} a ${diaMes(fim)}`
      : '';
  const linhas = `${inteiro(linhasTotal)} ${linhasTotal === 1 ? 'linha' : 'linhas'} de venda${periodo}`;

  const pendentes = naoMapeados.length;
  const reconhecimento =
    pendentes === 0
      ? 'Reconheci todos os produtos.'
      : `${pendentes} ${pendentes === 1 ? 'item que não reconheci' : 'itens que não reconheci'} (o operador vai mapear).`;

  return `Recebi! ${linhas}. ${reconhecimento}`;
}

// ---- pedido do dia, ajustes e comandos (fase 3) ----

const numero = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const quantidadeComUnidade = (n: number, unidade: Unidade) =>
  `${numero(n)} ${ROTULO_UNIDADE[unidade]}`;

export const MENSAGEM_ERRO_GENERICO =
  'Tive um problema aqui e não consegui fazer isso. Tente de novo daqui a pouco; se continuar, avise o operador.';

export const MENSAGEM_NAO_ENTENDI =
  'Não entendi. Use /perda, /falta ou /estoque (ex.: /perda mamão 6). Para o pedido de hoje, use os botões da mensagem.';

export const MENSAGEM_PEDIDO_ACEITO = 'Anotado! Pedido aceito.';
export const MENSAGEM_PEDIDO_ENCERRADO = 'Esse pedido não está mais aberto.';
export const MENSAGEM_SEM_PEDIDO_ABERTO = 'Não tem nenhum pedido aberto agora.';
export const MENSAGEM_PEDIDO_OUTRA_LOJA = 'Esse pedido não é desta loja.';

export const MENSAGEM_AJUSTE_FINALIZADO = 'Pronto! O que você não mexeu fica como sugerido.';
export const MENSAGEM_AJUSTE_AJUDA =
  'Não entendi. Mande o número e a quantidade, uma linha por item (ex.: 1 35). Quando terminar, mande ok.';
export const MENSAGEM_PEDE_NOTA = 'Escreva o motivo em poucas palavras.';
export const MENSAGEM_NOTA_ANOTADA =
  'Anotado. Pode mandar mais ajustes (ex.: 2 20) ou mandar ok para terminar.';

export function mensagemListaPedidos(itens: ItemSugestao[]): string {
  const pedidos = itens
    .filter((i) => i.posicao !== null)
    .sort((a, b) => (a.posicao ?? 0) - (b.posicao ?? 0));
  if (pedidos.length === 0) return 'Hoje não tem nada para pedir.';
  return pedidos
    .map(
      (i) =>
        `${i.posicao}. ${i.itemNome} — ${quantidadeComUnidade(i.quantidadeSugerida, i.unidade)}`,
    )
    .join('\n');
}

export function mensagemModoAjuste(itens: ItemSugestao[]): string {
  return `${mensagemListaPedidos(itens)}\n\nMande o número e a quantidade, uma linha por item (ex.: 1 35). Os que você não mandar ficam como sugerido. Quando terminar, mande ok.`;
}

export function mensagemItemAjustado(item: ItemSugestao, motivo?: MotivoResposta | null): string {
  const quantidade = quantidadeComUnidade(
    item.quantidadeResposta ?? item.quantidadeSugerida,
    item.unidade,
  );
  const inicio = `${item.posicao ?? '-'}. ${item.itemNome}: ${quantidade} ✓`;
  return motivo ? `${inicio} — motivo: ${ROTULO_MOTIVO_RESPOSTA[motivo]}` : `${inicio} — por quê?`;
}

export function mensagemPosicoesInvalidas(posicoes: number[]): string {
  return posicoes.length === 1
    ? `Não existe o número ${posicoes[0]} no pedido de hoje.`
    : `Não existem os números ${posicoes.join(', ')} no pedido de hoje.`;
}

export function mensagemLinhasNaoEntendidas(linhas: string[]): string {
  return `Não entendi: ${linhas.map((l) => `"${l}"`).join(', ')}. Use o formato "número quantidade" (ex.: 1 35).`;
}

export const USO_PERDA = 'Diga o item e quanto perdeu. Exemplo: /perda mamão 6';
export const USO_FALTA = 'Diga qual item faltou. Exemplo: /falta tomate';
export const USO_ESTOQUE = 'Diga o item e quanto tem agora. Exemplo: /estoque tomate 15';

export function mensagemItemNaoEncontrado(termo: string, itens: Item[]): string {
  const exemplos = itens
    .filter((i) => i.ativo)
    .slice(0, 4)
    .map((i) => i.nome);
  const dica = exemplos.length > 0 ? ` Alguns itens que conheço: ${exemplos.join(', ')}.` : '';
  return `Não achei '${termo}'.${dica}`;
}

export const MENSAGEM_QUAL_ITEM = 'Qual deles?';

export function mensagemPerdaRegistrada(item: Item, quantidade: number): string {
  return `Anotado: ${quantidadeComUnidade(quantidade, item.unidade)} de ${item.nome} descartados hoje.`;
}

export function mensagemFaltaRegistrada(item: Item): string {
  return `Anotado: faltou ${item.nome} hoje.`;
}

export function mensagemContagemRegistrada(item: Item, quantidade: number): string {
  return `Anotado: ${item.nome} agora tem ${quantidadeComUnidade(quantidade, item.unidade)} em estoque.`;
}
