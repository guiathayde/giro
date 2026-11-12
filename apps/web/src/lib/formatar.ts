/** '2026-10-12' → '12/10/2026' */
export const dataBr = (iso: string | null) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—';

export const periodo = (inicio: string | null, fim: string | null) =>
  !inicio || !fim ? '—' : inicio === fim ? dataBr(inicio) : `${dataBr(inicio)} a ${dataBr(fim)}`;

export const numero = (n: number, casas = 3) =>
  n.toLocaleString('pt-BR', { maximumFractionDigits: casas });

export const dinheiro = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
