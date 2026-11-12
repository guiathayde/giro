import { healthSchema } from '@giro/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGetQualquerStatus } from '@/lib/api';
import { cn } from '@/lib/utils';

/** bolinha no cabeçalho: verde com API, banco e bot ok; amarela com bot desativado; vermelha com erro */
export function StatusSistema() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiGetQualquerStatus('/health', healthSchema),
    refetchInterval: 30_000,
  });
  const h = health.data;
  const cor =
    !h || h.status === 'erro' || h.bot === 'erro'
      ? 'bg-destructive'
      : h.bot === 'ativo'
        ? 'bg-emerald-500'
        : 'bg-amber-500';
  const texto = h
    ? `API ${h.status} · banco ${h.db} · bot ${h.bot}`
    : health.isPending
      ? 'verificando…'
      : 'API fora do ar';
  return (
    <span className="flex items-center gap-2 text-xs text-muted-foreground" title={texto}>
      <span className={cn('size-2 rounded-full', cor)} aria-hidden />
      <span className="hidden md:inline">{texto}</span>
    </span>
  );
}
