// Textos que o bot manda para o dono. Puros, em português simples.
import type { ResumoImportacao } from '@giro/shared';
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
