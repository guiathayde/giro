// Valores dos enums do banco (docs/PLANO-MVP.md, seção 3).
// Fonte única: o schema Drizzle e o painel importam daqui.

export const CANAIS = ['telegram', 'manual'] as const;
export type Canal = (typeof CANAIS)[number];

export const UNIDADES = ['kg', 'un', 'maco', 'cx'] as const;
export type Unidade = (typeof UNIDADES)[number];

export const ORIGENS_IMPORTACAO = ['pdv_csv', 'pdv_xlsx', 'manual', 'telegram'] as const;
export type OrigemImportacao = (typeof ORIGENS_IMPORTACAO)[number];

export const STATUS_IMPORTACAO = ['pending', 'done', 'error'] as const;
export type StatusImportacao = (typeof STATUS_IMPORTACAO)[number];

export const ORIGENS_CONTAGEM = ['owner', 'operator'] as const;
export type OrigemContagem = (typeof ORIGENS_CONTAGEM)[number];

export const ORIGENS_COMPRA = ['owner_reply', 'invoice', 'manual'] as const;
export type OrigemCompra = (typeof ORIGENS_COMPRA)[number];

export const STATUS_SUGESTAO = ['draft', 'sent', 'answered', 'expired'] as const;
export type StatusSugestao = (typeof STATUS_SUGESTAO)[number];

export const ACOES_SUGESTAO = ['order', 'skip', 'risk'] as const;
export type AcaoSugestao = (typeof ACOES_SUGESTAO)[number];

export const RESPOSTAS_SUGESTAO = ['accepted', 'adjusted', 'ignored'] as const;
export type RespostaSugestao = (typeof RESPOSTAS_SUGESTAO)[number];

export const MOTIVOS_RESPOSTA = [
  'price',
  'holiday',
  'weather',
  'promotion',
  'stock_wrong',
  'other',
] as const;
export type MotivoResposta = (typeof MOTIVOS_RESPOSTA)[number];

export const MOTIVOS_PERDA = ['spoiled', 'damaged', 'unsold_promo', 'other'] as const;
export type MotivoPerda = (typeof MOTIVOS_PERDA)[number];

export const TIPOS_EVENTO = ['holiday', 'fair', 'event'] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];
