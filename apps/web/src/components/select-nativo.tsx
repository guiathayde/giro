import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** <select> nativo com o visual do Input: no celular abre o seletor do sistema. */
export function SelectNativo({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
