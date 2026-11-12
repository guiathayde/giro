import { erroApiSchema } from '@giro/shared';
import type { z } from 'zod';

// Em dev o Vite faz proxy de /api; no docker, o nginx.
const BASE = '/api';

const CHAVE_TOKEN = 'giro.token';
/** disparado quando a API responde 401; o TokenGate pede o token de acesso */
export const EVENTO_NAO_AUTORIZADO = 'giro:nao-autorizado';

export function lerToken(): string | null {
  try {
    return localStorage.getItem(CHAVE_TOKEN);
  } catch {
    return null;
  }
}

export function salvarToken(token: string | null) {
  try {
    if (token) localStorage.setItem(CHAVE_TOKEN, token);
    else localStorage.removeItem(CHAVE_TOKEN);
  } catch {
    // sem storage (aba privada): o token vale só até recarregar
  }
}

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
  const token = lerToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);

  const res = await fetch(`${BASE}${caminho}`, { ...init, headers });
  if (res.status === 401) window.dispatchEvent(new Event(EVENTO_NAO_AUTORIZADO));

  const corpo: unknown = res.status === 204 ? null : await res.json().catch(() => null);
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
  metodo: 'POST' | 'PUT' | 'PATCH',
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

export async function apiDelete(caminho: string): Promise<void> {
  const token = lerToken();
  const res = await fetch(`${BASE}${caminho}`, {
    method: 'DELETE',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 401) window.dispatchEvent(new Event(EVENTO_NAO_AUTORIZADO));
  if (!res.ok) {
    const erro = erroApiSchema.safeParse(await res.json().catch(() => null));
    throw new ErroApi(res.status, erro.success ? erro.data.erro : `HTTP ${res.status}`);
  }
}

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
