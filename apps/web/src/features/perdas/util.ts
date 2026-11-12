/** Aceita "1,5" e "1.5"; devolve null se não for número. */
export function lerNumero(texto: string): number | null {
  const limpo = texto.trim().replace(/\s/g, '').replace(',', '.');
  if (limpo === '') return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/** Data de hoje (AAAA-MM-DD) no relógio do aparelho. */
export function hojeIso(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Primeira mensagem de erro do Zod por campo (pelo primeiro item do caminho). */
export function primeiroErroPorCampo(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const erros: Record<string, string> = {};
  for (const i of issues) {
    const campo = String(i.path[0] ?? '');
    erros[campo] ??= i.message;
  }
  return erros;
}
