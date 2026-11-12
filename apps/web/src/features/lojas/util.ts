import type { ZodError } from 'zod';

/** Lê número digitado no padrão brasileiro: "1,5", "1.234,5" ou "1.5". Vazio → null; inválido → NaN. */
export function lerNumero(texto: string): number | null {
  const t = texto.trim();
  if (t === '') return null;
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  return /^-?\d+(\.\d+)?$/.test(normal) ? Number(normal) : Number.NaN;
}

/** Número para mostrar em campo de texto, com vírgula decimal. */
export const numeroParaCampo = (n: number | null | undefined) =>
  n === null || n === undefined ? '' : String(n).replace('.', ',');

/** Primeiro erro de cada campo do Zod, para mostrar junto do campo. */
export function errosPorCampo(erro: ZodError): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const issue of erro.issues) {
    const chave = String(issue.path[0] ?? '_');
    campos[chave] ??= issue.message;
  }
  return campos;
}

/** AAAA-MM-DD de hoje no relógio do aparelho. */
export function hojeIso(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Soma dias a uma data AAAA-MM-DD (sem fuso). */
export function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
