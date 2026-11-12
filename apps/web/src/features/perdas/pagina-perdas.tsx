import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useItens } from '@/features/stores/api';
import { SeletorLoja } from '@/features/stores/loja-atual';
import { useLojaAtual } from '@/features/stores/use-loja-atual';
import type { Periodo } from './api';
import { FormContagem, FormDescarte, FormFalta } from './formularios';
import { ListaContagens, ListaFaltas, ListaPerdas } from './listas';

export function PaginaPerdas() {
  const { loja, lojas, escolher } = useLojaAtual();

  if (lojas.isPending) return <Skeleton className="h-40 w-full" />;
  if (lojas.isError)
    return (
      <Alert variant="destructive">
        <AlertDescription>{lojas.error.message}</AlertDescription>
      </Alert>
    );
  if (!loja)
    return (
      <p>
        Nenhuma loja cadastrada. Rode <code>pnpm db:seed</code>.
      </p>
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Perdas e faltas</h1>
          <p className="text-sm text-muted-foreground">{loja.nome}</p>
        </div>
        <SeletorLoja lojas={lojas.data} loja={loja} escolher={escolher} />
      </div>
      <Registros key={loja.id} lojaId={loja.id} />
    </div>
  );
}

function Registros({ lojaId }: { lojaId: number }) {
  const itens = useItens(lojaId);
  const [periodo, setPeriodo] = useState<Periodo>({ from: '', to: '' });

  return (
    <Tabs defaultValue="descarte">
      <TabsList className="w-full">
        <TabsTrigger value="descarte">Descarte</TabsTrigger>
        <TabsTrigger value="falta">Falta</TabsTrigger>
        <TabsTrigger value="contagem">Contagem</TabsTrigger>
      </TabsList>

      <Card className="mt-2">
        <CardHeader>
          <CardTitle className="text-base">Período das listas</CardTitle>
          <CardDescription>Se deixar em branco, mostra os últimos 30 dias.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="perdas-de">De</Label>
            <Input
              id="perdas-de"
              type="date"
              value={periodo.from}
              max={periodo.to || undefined}
              onChange={(e) => setPeriodo({ ...periodo, from: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="perdas-ate">Até</Label>
            <Input
              id="perdas-ate"
              type="date"
              value={periodo.to}
              min={periodo.from || undefined}
              onChange={(e) => setPeriodo({ ...periodo, to: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <TabsContent value="descarte" className="flex flex-col gap-4">
        <Cartao titulo="Novo descarte" itens={itens}>
          {(lista) => <FormDescarte lojaId={lojaId} itens={lista} />}
        </Cartao>
        <Card>
          <CardHeader>
            <CardTitle>Descartes</CardTitle>
          </CardHeader>
          <CardContent>
            <ListaPerdas lojaId={lojaId} periodo={periodo} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="falta" className="flex flex-col gap-4">
        <Cartao titulo="Nova falta" itens={itens}>
          {(lista) => <FormFalta lojaId={lojaId} itens={lista} />}
        </Cartao>
        <Card>
          <CardHeader>
            <CardTitle>Faltas</CardTitle>
          </CardHeader>
          <CardContent>
            <ListaFaltas lojaId={lojaId} periodo={periodo} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="contagem" className="flex flex-col gap-4">
        <Cartao titulo="Nova contagem de estoque" itens={itens}>
          {(lista) => <FormContagem lojaId={lojaId} itens={lista} />}
        </Cartao>
        <Card>
          <CardHeader>
            <CardTitle>Contagens</CardTitle>
          </CardHeader>
          <CardContent>
            <ListaContagens lojaId={lojaId} periodo={periodo} />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function Cartao({
  titulo,
  itens,
  children,
}: {
  titulo: string;
  itens: ReturnType<typeof useItens>;
  children: (itens: NonNullable<ReturnType<typeof useItens>['data']>) => React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        {itens.isPending && <Skeleton className="h-40 w-full" />}
        {itens.isError && (
          <Alert variant="destructive">
            <AlertDescription>{itens.error.message}</AlertDescription>
          </Alert>
        )}
        {itens.data && itens.data.length === 0 && (
          <p className="text-muted-foreground">
            Esta loja ainda não tem itens cadastrados. Cadastre em “Itens”.
          </p>
        )}
        {itens.data && itens.data.length > 0 && children(itens.data)}
      </CardContent>
    </Card>
  );
}
