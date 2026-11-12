import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

/** Rótulo + controle + ajuda + erro, ligados por id/aria. O controle recebe `id`, `aria-describedby` e `aria-invalid`. */
export function Campo({
  id,
  rotulo,
  ajuda,
  erro,
  children,
}: {
  id: string;
  rotulo: string;
  ajuda?: string;
  erro?: string;
  children: (props: {
    id: string;
    'aria-describedby': string | undefined;
    'aria-invalid': boolean;
  }) => ReactNode;
}) {
  const descricao = [ajuda ? `${id}-ajuda` : null, erro ? `${id}-erro` : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      {children({
        id,
        'aria-describedby': descricao || undefined,
        'aria-invalid': Boolean(erro),
      })}
      {ajuda && (
        <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">
          {ajuda}
        </p>
      )}
      {erro && (
        <p id={`${id}-erro`} className="text-xs text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
