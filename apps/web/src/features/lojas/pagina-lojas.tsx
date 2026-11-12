import { ROTULO_CANAL, type Loja } from '@giro/shared';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useLojas } from '@/features/stores/api';
import { EventosLoja } from './eventos-loja';
import { FormLoja } from './form-loja';
import { VinculoTelegram } from './vinculo-telegram';

type Dialogo = { tipo: 'nova' } | { tipo: 'editar'; loja: Loja } | null;

export function PaginaLojas() {
  const lojas = useLojas();
  const [dialogo, setDialogo] = useState<Dialogo>(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lojas</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro, vínculo com o Telegram e eventos de calendário.
          </p>
        </div>
        <Button onClick={() => setDialogo({ tipo: 'nova' })}>Nova loja</Button>
      </div>

      {lojas.isPending && (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}
      {lojas.isError && (
        <Alert variant="destructive">
          <AlertDescription>{lojas.error.message}</AlertDescription>
        </Alert>
      )}
      {lojas.data?.length === 0 && (
        <p className="text-muted-foreground">
          Nenhuma loja cadastrada ainda. Toque em “Nova loja”.
        </p>
      )}
      {lojas.data?.map((loja) => (
        <CardLoja key={loja.id} loja={loja} editar={() => setDialogo({ tipo: 'editar', loja })} />
      ))}

      {dialogo?.tipo === 'nova' && <FormLoja aoFechar={() => setDialogo(null)} />}
      {dialogo?.tipo === 'editar' && (
        <FormLoja key={dialogo.loja.id} loja={dialogo.loja} aoFechar={() => setDialogo(null)} />
      )}
    </div>
  );
}

function CardLoja({ loja, editar }: { loja: Loja; editar: () => void }) {
  return (
    <Card id={`loja-${loja.id}`}>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="break-words">{loja.nome}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Dono: {loja.nomeDono}
            {loja.whatsapp && ` · WhatsApp ${loja.whatsapp}`}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="outline">{ROTULO_CANAL[loja.canal]}</Badge>
            {loja.sistemaPdv && <Badge variant="secondary">PDV: {loja.sistemaPdv}</Badge>}
            {loja.envioAutomatico && <Badge>envio automático ligado</Badge>}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={editar}>
          Editar
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <VinculoTelegram loja={loja} />
        <Separator />
        <EventosLoja loja={loja} />
      </CardContent>
    </Card>
  );
}
