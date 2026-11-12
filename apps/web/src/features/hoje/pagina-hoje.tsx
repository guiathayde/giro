import { useState } from 'react';
import { Link } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { hojeIso, somarDias } from '@/features/lojas/util';
import { usePainelHoje } from './api';
import { CardLoja } from './card-loja';

export function PaginaHoje() {
  const [data, setData] = useState(hojeIso);
  const painel = usePainelHoje(data);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hoje</h1>
          <p className="text-sm text-muted-foreground">
            Sugestão do dia de cada loja, envio e respostas do dono.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Dia anterior"
            onClick={() => setData(somarDias(data, -1))}
          >
            ‹
          </Button>
          <Input
            type="date"
            aria-label="Data"
            className="w-auto"
            value={data}
            onChange={(e) => e.target.value && setData(e.target.value)}
          />
          <Button
            variant="outline"
            size="icon"
            aria-label="Próximo dia"
            onClick={() => setData(somarDias(data, 1))}
          >
            ›
          </Button>
          {data !== hojeIso() && (
            <Button variant="ghost" size="sm" onClick={() => setData(hojeIso())}>
              Hoje
            </Button>
          )}
        </div>
      </div>

      {painel.data && painel.data.inboxAbertas > 0 && (
        <Alert>
          <AlertDescription>
            {painel.data.inboxAbertas === 1
              ? '1 mensagem do bot não foi entendida.'
              : `${painel.data.inboxAbertas} mensagens do bot não foram entendidas.`}{' '}
            <Link to="/inbox" className="font-medium underline underline-offset-4">
              Ver no Inbox
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {painel.isPending && (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}
      {painel.isError && (
        <Alert variant="destructive">
          <AlertDescription>{painel.error.message}</AlertDescription>
        </Alert>
      )}
      {painel.data?.lojas.length === 0 && (
        <p className="text-muted-foreground">
          Nenhuma loja cadastrada.{' '}
          <Link to="/lojas" className="underline underline-offset-4">
            Cadastrar em Lojas
          </Link>
        </p>
      )}
      {painel.data?.lojas.map((linha) => (
        <CardLoja key={linha.loja.id} linha={linha} data={painel.data.data} />
      ))}
    </div>
  );
}
