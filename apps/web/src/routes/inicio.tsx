import { healthSchema } from '@giro/shared';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { apiGetQualquerStatus } from '@/lib/api';

export function Inicio() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiGetQualquerStatus('/health', healthSchema),
    refetchInterval: 10_000,
  });

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Início</h1>
        <p className="text-muted-foreground">Olá! Este é o painel do operador.</p>
      </header>

      <section className="rounded-lg border border-border p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Status da API</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void health.refetch()}
            disabled={health.isFetching}
          >
            Atualizar
          </Button>
        </div>
        {health.isPending && <p>Verificando…</p>}
        {health.isError && (
          <p className="text-destructive">API fora do ar: {health.error.message}</p>
        )}
        {health.data && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">API</dt>
            <dd data-testid="status-api">{health.data.status}</dd>
            <dt className="text-muted-foreground">Banco</dt>
            <dd data-testid="status-db">{health.data.db}</dd>
            <dt className="text-muted-foreground">Bot do Telegram</dt>
            <dd data-testid="status-bot">{health.data.bot}</dd>
          </dl>
        )}
      </section>
    </div>
  );
}
