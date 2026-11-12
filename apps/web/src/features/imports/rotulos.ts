import type { Importacao, Unidade } from '@giro/shared';

export const ORIGEM: Record<Importacao['origem'], string> = {
  telegram: 'Telegram',
  pdv_csv: 'Painel (CSV)',
  pdv_xlsx: 'Painel (Excel)',
  manual: 'Manual',
};

export const UNIDADE: Record<Unidade, string> = { kg: 'kg', un: 'un', maco: 'maço', cx: 'cx' };
