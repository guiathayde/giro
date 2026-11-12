import type { MensagemInbox } from '@giro/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusImportacao } from '@/features/imports/status';
import { dataHora, numero, periodo } from '@/lib/formatar';
import { useInbox, useResolverMensagem, type StatusInbox } from './api';

export function PaginaInbox() {
  const [status, setStatus] = useState<StatusInbox>('abertas');
  const inbox = useInbox(status);
  const resolver = useResolverMensagem();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inbox do bot</h1>
        <p className="text-sm text-muted-foreground">
          O que chegou no Telegram e o sistema não soube tratar.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mensagens não entendidas</CardTitle>
          <CardDescription>
            Leia, responda ao dono por fora se precisar e toque em “Resolver”.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Tabs value={status} onValueChange={(v) => setStatus(v as StatusInbox)}>
            <TabsList>
              <TabsTrigger value="abertas">Abertas</TabsTrigger>
              <TabsTrigger value="todas">Todas</TabsTrigger>
            </TabsList>
          </Tabs>
          {inbox.isPending && (
            <div className="flex flex-col gap-2" aria-busy="true">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}
          {inbox.isError && (
            <Alert variant="destructive">
              <AlertDescription>{inbox.error.message}</AlertDescription>
            </Alert>
          )}
          {inbox.data && inbox.data.mensagens.length === 0 && (
            <p className="text-muted-foreground">
              {status === 'abertas' ? 'Nenhuma mensagem aberta. Tudo em dia.' : 'Nenhuma mensagem.'}
            </p>
          )}
          {inbox.data && inbox.data.mensagens.length > 0 && (
            <ul aria-label="Mensagens" className="divide-y">
              {inbox.data.mensagens.map((m) => (
                <Mensagem
                  key={m.id}
                  mensagem={m}
                  resolvendo={resolver.isPending && resolver.variables === m.id}
                  aoResolver={() => resolver.mutate(m.id)}
                />
              ))}
            </ul>
          )}
          {resolver.isError && (
            <Alert variant="destructive">
              <AlertDescription>{resolver.error.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Arquivos recebidos pelo bot</CardTitle>
          <CardDescription>Planilhas de vendas que o dono mandou no Telegram.</CardDescription>
        </CardHeader>
        <CardContent>
          {inbox.isPending && <Skeleton className="h-16 w-full" />}
          {inbox.data && inbox.data.arquivos.length === 0 && (
            <p className="text-muted-foreground">Nenhum arquivo recebido pelo bot ainda.</p>
          )}
          {inbox.data && inbox.data.arquivos.length > 0 && (
            <ul aria-label="Arquivos recebidos" className="divide-y">
              {inbox.data.arquivos.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link
                      to={`/importar/${a.id}`}
                      className="block font-medium break-all underline-offset-4 hover:underline"
                    >
                      {a.nomeArquivo ?? `Arquivo #${a.id}`}
                    </Link>
                    <div className="text-sm text-muted-foreground">
                      {dataHora(a.criadoEm)} · {periodo(a.inicioPeriodo, a.fimPeriodo)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {numero(a.linhasTotal)} linhas
                      {a.linhasNaoMapeadas > 0 && ` · ${numero(a.linhasNaoMapeadas)} a mapear`}
                    </div>
                    {a.erro && <div className="text-sm text-destructive">{a.erro}</div>}
                  </div>
                  <StatusImportacao importacao={a} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Mensagem({
  mensagem: m,
  resolvendo,
  aoResolver,
}: {
  mensagem: MensagemInbox;
  resolvendo: boolean;
  aoResolver: () => void;
}) {
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {m.lojaNome ? (
          <span className="font-medium">{m.lojaNome}</span>
        ) : (
          <Badge variant="outline">Chat não vinculado</Badge>
        )}
        <span className="text-muted-foreground">{dataHora(m.criadoEm)}</span>
        {m.resolvidoEm && <Badge variant="secondary">Resolvida {dataHora(m.resolvidoEm)}</Badge>}
      </div>
      <p className="break-words whitespace-pre-wrap">{m.texto}</p>
      {!m.lojaId && <p className="text-xs text-muted-foreground">Chat {m.chatId}</p>}
      {!m.resolvidoEm && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full sm:w-fit"
          disabled={resolvendo}
          onClick={aoResolver}
        >
          {resolvendo ? 'Resolvendo…' : 'Resolver'}
        </Button>
      )}
    </li>
  );
}
