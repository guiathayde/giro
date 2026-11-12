import type { Loja } from '@giro/shared';
import { useSearchParams } from 'react-router';
import { useLojas } from './api';

/** Loja escolhida (?loja=ID na URL); sem escolha, a primeira. */
export function useLojaAtual() {
  const lojas = useLojas();
  const [params, setParams] = useSearchParams();
  const escolhida = Number(params.get('loja'));
  const loja: Loja | undefined = lojas.data?.find((l) => l.id === escolhida) ?? lojas.data?.[0];
  const escolher = (id: number) =>
    setParams((p) => {
      p.set('loja', String(id));
      return p;
    });
  return { loja, lojas, escolher };
}
