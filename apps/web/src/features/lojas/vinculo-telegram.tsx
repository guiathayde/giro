import type { Loja } from '@giro/shared';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useGerarLinkTelegram } from './api';

export function VinculoTelegram({ loja }: { loja: Loja }) {
  const gerar = useGerarLinkTelegram(loja.id);
  const [copiado, setCopiado] = useState<'sim' | 'falhou' | null>(null);
  const link = gerar.data?.link ?? null;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link ?? '');
      setCopiado('sim');
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setCopiado('falhou');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Telegram</span>
        {loja.telegramVinculado ? (
          <Badge>vinculado</Badge>
        ) : (
          <Badge variant="outline">não vinculado</Badge>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => gerar.mutate()}
          disabled={gerar.isPending}
        >
          {gerar.isPending ? 'Gerando…' : loja.telegramVinculado ? 'Gerar novo link' : 'Gerar link'}
        </Button>
      </div>
      {gerar.isError && (
        <Alert variant="destructive">
          <AlertDescription>{gerar.error.message}</AlertDescription>
        </Alert>
      )}
      {gerar.data && !link && (
        <Alert>
          <AlertDescription>Bot desativado — configure o token do Telegram.</AlertDescription>
        </Alert>
      )}
      {link && (
        <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 text-sm break-all">{link}</code>
          <Button type="button" size="sm" onClick={() => void copiar()}>
            {copiado === 'sim' ? 'Copiado' : 'Copiar link'}
          </Button>
        </div>
      )}
      {copiado === 'falhou' && (
        <p className="text-xs text-destructive">Não consegui copiar. Selecione o link e copie.</p>
      )}
      {link && (
        <p className="text-xs text-muted-foreground">
          Mande este link ao dono. Quando ele tocar em “Iniciar” no Telegram, a loja fica vinculada.
        </p>
      )}
    </div>
  );
}
