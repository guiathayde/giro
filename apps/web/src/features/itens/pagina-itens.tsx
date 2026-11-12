import { ROTULO_UNIDADE, type Item } from '@giro/shared';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useItens } from '@/features/stores/api';
import { SeletorLoja } from '@/features/stores/loja-atual';
import { useLojaAtual } from '@/features/stores/use-loja-atual';
import { dinheiro, numero } from '@/lib/formatar';
import { FormItem } from './form-item';

type Dialogo = { tipo: 'novo' } | { tipo: 'editar'; item: Item } | null;

export function PaginaItens() {
  const { loja, lojas, escolher } = useLojaAtual();
  const itens = useItens(loja?.id);
  const [dialogo, setDialogo] = useState<Dialogo>(null);

  if (lojas.isPending) return <Skeleton className="h-40 w-full" />;
  if (lojas.isError)
    return (
      <Alert variant="destructive">
        <AlertDescription>{lojas.error.message}</AlertDescription>
      </Alert>
    );
  if (!loja) return <p className="text-muted-foreground">Cadastre uma loja primeiro, em Lojas.</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Itens</h1>
          <p className="text-sm text-muted-foreground">{loja.nome}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SeletorLoja lojas={lojas.data} loja={loja} escolher={escolher} />
          <Button onClick={() => setDialogo({ tipo: 'novo' })}>Novo item</Button>
        </div>
      </div>

      {itens.isPending && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}
      {itens.isError && (
        <Alert variant="destructive">
          <AlertDescription>{itens.error.message}</AlertDescription>
        </Alert>
      )}
      {itens.data?.length === 0 && (
        <p className="text-muted-foreground">Nenhum item nesta loja ainda. Toque em “Novo item”.</p>
      )}
      {itens.data && itens.data.length > 0 && (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="hidden sm:table-cell">Un.</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Vida útil</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Custo</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Preço</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Múltiplo</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Apelidos</TableHead>
                  <TableHead className="w-0">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.data.map((item) => (
                  <TableRow key={item.id} className={item.ativo ? undefined : 'opacity-60'}>
                    <TableCell className="max-w-40 whitespace-normal sm:max-w-none">
                      <div className="flex flex-wrap items-center gap-1.5 font-medium">
                        <span className="break-words">{item.nome}</span>
                        {!item.ativo && <Badge variant="outline">inativo</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground md:hidden">
                        {ROTULO_UNIDADE[item.unidade]} · {item.vidaUtilDias} dias ·{' '}
                        {dinheiro(item.custoMedio)} / {dinheiro(item.precoMedio)}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {ROTULO_UNIDADE[item.unidade]}
                    </TableCell>
                    <TableCell className="hidden text-right md:table-cell">
                      {item.vidaUtilDias} dias
                    </TableCell>
                    <TableCell className="hidden text-right md:table-cell">
                      {dinheiro(item.custoMedio)}
                    </TableCell>
                    <TableCell className="hidden text-right md:table-cell">
                      {dinheiro(item.precoMedio)}
                    </TableCell>
                    <TableCell className="hidden text-right lg:table-cell">
                      {item.multiploPedido === null ? 'padrão' : numero(item.multiploPedido)}
                    </TableCell>
                    <TableCell className="hidden text-right lg:table-cell">
                      {item.aliases.length}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Editar ${item.nome}`}
                        onClick={() => setDialogo({ tipo: 'editar', item })}
                      >
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {dialogo?.tipo === 'novo' && <FormItem lojaId={loja.id} aoFechar={() => setDialogo(null)} />}
      {dialogo?.tipo === 'editar' && (
        <FormItem
          key={dialogo.item.id}
          lojaId={loja.id}
          item={dialogo.item}
          aoFechar={() => setDialogo(null)}
        />
      )}
    </div>
  );
}
