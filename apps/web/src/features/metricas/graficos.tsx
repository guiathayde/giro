import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { dataBr } from '@/lib/formatar';

export interface Barra {
  /** segunda-feira da semana (AAAA-MM-DD) */
  semana: string;
  valor: number;
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** A semana (segunda a domingo) que contém a data de início das sugestões. */
const semanaContem = (semana: string, data: string | null) =>
  data !== null && data >= semana && data < somarDias(semana, 7);

/**
 * Gráfico de barras horizontais feito com CSS: uma linha por semana, com rótulo e valor em
 * texto (legível e lido por leitor de tela). As barras em si são decorativas.
 */
export function GraficoBarras({
  titulo,
  barras,
  formatar,
  cor = 'bg-primary',
  inicioSugestoes,
  maximo,
  meta,
}: {
  titulo: string;
  barras: Barra[];
  formatar: (valor: number) => string;
  cor?: string;
  inicioSugestoes: string | null;
  /** escala fixa (ex.: 7 dias); sem ela, usa o maior valor */
  maximo?: number;
  /** linha de referência opcional */
  meta?: number;
}) {
  const topo = Math.max(maximo ?? 0, ...barras.map((b) => b.valor), 0);
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm font-medium">{titulo}</figcaption>
      {barras.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem dados no período.</p>
      ) : (
        <ul aria-label={titulo} className="flex flex-col gap-2">
          {barras.map((b) => {
            const marca = semanaContem(b.semana, inicioSugestoes);
            const largura = topo > 0 ? (b.valor / topo) * 100 : 0;
            return (
              <li
                key={b.semana}
                className="grid grid-cols-[4.5rem_1fr_5rem] items-center gap-2 text-sm"
                aria-label={`Semana de ${dataBr(b.semana)}: ${formatar(b.valor)}${marca ? ', início das sugestões' : ''}`}
              >
                <span className="text-muted-foreground tabular-nums">
                  {dataBr(b.semana).slice(0, 5)}
                </span>
                <span
                  aria-hidden="true"
                  className="relative block h-4 overflow-hidden rounded-sm bg-muted"
                >
                  <span
                    className={cn('absolute inset-y-0 left-0 block rounded-sm', cor)}
                    style={{ width: `${largura}%` }}
                  />
                  {meta !== undefined && topo > 0 && (
                    <span
                      className="absolute inset-y-0 w-0.5 bg-foreground/60"
                      style={{ left: `${Math.min(100, (meta / topo) * 100)}%` }}
                    />
                  )}
                </span>
                <span className="text-right font-medium tabular-nums">{formatar(b.valor)}</span>
                {marca && (
                  <Badge variant="secondary" className="col-span-3 w-fit">
                    Sugestões começaram nesta semana
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {meta !== undefined && barras.length > 0 && (
        <p className="text-xs text-muted-foreground">A linha vertical marca a meta ({meta}).</p>
      )}
    </figure>
  );
}
