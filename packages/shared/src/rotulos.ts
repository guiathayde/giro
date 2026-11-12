// Rótulos em português simples para os enums do banco (painel e bot).
import type {
  AcaoSugestao,
  Canal,
  MotivoPerda,
  MotivoResposta,
  StatusSugestao,
  TipoEvento,
  Unidade,
} from './enums';

export const ROTULO_UNIDADE: Record<Unidade, string> = {
  kg: 'kg',
  un: 'un',
  maco: 'maço',
  cx: 'cx',
};

export const ROTULO_CANAL: Record<Canal, string> = {
  telegram: 'Telegram',
  manual: 'WhatsApp (manual)',
};

export const ROTULO_STATUS_SUGESTAO: Record<StatusSugestao, string> = {
  draft: 'rascunho',
  sent: 'enviada',
  answered: 'respondida',
  expired: 'sem resposta',
};

export const ROTULO_ACAO: Record<AcaoSugestao, string> = {
  order: 'pedir',
  skip: 'não repor',
  risk: 'encalhe',
};

export const ROTULO_MOTIVO_RESPOSTA: Record<MotivoResposta, string> = {
  price: 'preço no CEASA',
  holiday: 'feriado',
  weather: 'clima',
  promotion: 'promoção',
  stock_wrong: 'estoque errado',
  other: 'outro',
};

export const ROTULO_MOTIVO_PERDA: Record<MotivoPerda, string> = {
  spoiled: 'estragou',
  damaged: 'avariado',
  unsold_promo: 'não vendeu nem na promoção',
  other: 'outro',
};

export const ROTULO_TIPO_EVENTO: Record<TipoEvento, string> = {
  holiday: 'feriado',
  fair: 'feira',
  event: 'evento',
};
