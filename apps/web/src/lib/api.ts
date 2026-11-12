import { erroApiSchema } from '@giro/shared';
import type { z } from 'zod';

// Em dev o Vite faz proxy de /api; no docker, o nginx.
const BASE = '/api';

export class ErroApi extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function requisitar<T extends z.ZodType>(
  caminho: string,
  schema: T,
  init: RequestInit = {},
  aceitar: (status: number) => boolean = (s) => s >= 200 && s < 300,
): Promise<z.infer<T>> {
  const res = await fetch(`${BASE}${caminho}`, init);
  const corpo: unknown = await res.json().catch(() => null);
  if (!aceitar(res.status)) {
    const erro = erroApiSchema.safeParse(corpo);
    throw new ErroApi(res.status, erro.success ? erro.data.erro : `HTTP ${res.status}`);
  }
  const resultado = schema.safeParse(corpo);
  if (!resultado.success) throw new ErroApi(res.status, `Resposta inesperada de ${caminho}`);
  return resultado.data;
}

export const apiGet = <T extends z.ZodType>(caminho: string, schema: T) =>
  requisitar(caminho, schema);

/** /health devolve 503 com corpo válido quando o banco cai; o schema decide. */
export const apiGetQualquerStatus = <T extends z.ZodType>(caminho: string, schema: T) =>
  requisitar(caminho, schema, {}, () => true);

export const apiEnviarJson = <T extends z.ZodType>(
  metodo: 'POST' | 'PUT',
  caminho: string,
  corpo: unknown,
  schema: T,
) =>
  requisitar(caminho, schema, {
    method: metodo,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
  });

export const apiPostSemCorpo = <T extends z.ZodType>(caminho: string, schema: T) =>
  requisitar(caminho, schema, { method: 'POST' });

export const apiEnviarArquivo = <T extends z.ZodType>(
  caminho: string,
  campo: string,
  arquivo: File,
  schema: T,
) => {
  const form = new FormData();
  form.append(campo, arquivo);
  return requisitar(caminho, schema, { method: 'POST', body: form });
};
