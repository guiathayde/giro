import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SeletorLoja } from '@/features/stores/loja-atual';
import { useLojaAtual } from '@/features/stores/use-loja-atual';
import { dataHora, numero, periodo } from '@/lib/formatar';
import { ACEITAR_ARQUIVOS, useEnviarArquivo, useImportacoes } from './api';
import { ORIGEM } from './rotulos';
import { StatusImportacao } from './status';

export function PaginaImportacoes() {
  const { loja, lojas, escolher } = useLojaAtual();

  if (lojas.isPending) return <p className="text-muted-foreground">Carregando…</p>;
  if (lojas.isError) return <p className="text-destructive">{lojas.error.message}</p>;
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
          <h1 className="text-2xl font-semibold tracking-tight">Importar vendas</h1>
          <p className="text-sm text-muted-foreground">{loja.nome}</p>
        </div>
        <SeletorLoja lojas={lojas.data} loja={loja} escolher={escolher} />
      </div>
      <EnviarArquivo key={loja.id} lojaId={loja.id} />
      <ListaImportacoes lojaId={loja.id} />
    </div>
  );
}

function EnviarArquivo({ lojaId }: { lojaId: number }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const enviar = useEnviarArquivo(lojaId);
  const navigate = useNavigate();

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (!arquivo) return;
    const resumo = await enviar.mutateAsync(arquivo);
    void navigate(`/importar/${resumo.importacao.id}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enviar arquivo do PDV</CardTitle>
        <CardDescription>
          CSV ou Excel exportado do sistema da loja, com descrição, quantidade e data de cada venda.
          O dono também pode mandar o arquivo direto no bot do Telegram.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void aoEnviar(e)} className="flex flex-col gap-3 sm:flex-row">
          <Input
            type="file"
            accept={ACEITAR_ARQUIVOS}
            aria-label="Arquivo de vendas"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          />
          <Button type="submit" disabled={!arquivo || enviar.isPending}>
            {enviar.isPending ? 'Enviando…' : 'Importar'}
          </Button>
        </form>
        {enviar.isError && (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription>{enviar.error.message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function ListaImportacoes({ lojaId }: { lojaId: number }) {
  const importacoes = useImportacoes(lojaId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Importações</CardTitle>
        <CardDescription>
          As que estão com “Mapear” têm produtos que o sistema não reconheceu.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {importacoes.isPending && <p className="text-muted-foreground">Carregando…</p>}
        {importacoes.isError && <p className="text-destructive">{importacoes.error.message}</p>}
        {importacoes.data?.length === 0 && (
          <p className="text-muted-foreground">Nenhum arquivo importado ainda.</p>
        )}
        {importacoes.data && importacoes.data.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arquivo</TableHead>
                  <TableHead className="hidden sm:table-cell">Recebido</TableHead>
                  <TableHead className="hidden sm:table-cell">Período</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Linhas</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">A mapear</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importacoes.data.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="max-w-48 sm:max-w-56">
                      <Link
                        to={`/importar/${i.id}`}
                        className="block truncate font-medium underline-offset-4 hover:underline"
                      >
                        {i.nomeArquivo ?? `#${i.id}`}
                      </Link>
                      <div className="text-xs text-muted-foreground">{ORIGEM[i.origem]}</div>
                      <div className="text-xs text-muted-foreground sm:hidden">
                        {periodo(i.inicioPeriodo, i.fimPeriodo)}
                        {i.linhasNaoMapeadas > 0 && ` · ${numero(i.linhasNaoMapeadas)} a mapear`}
                      </div>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap sm:table-cell">
                      {dataHora(i.criadoEm)}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap sm:table-cell">
                      {periodo(i.inicioPeriodo, i.fimPeriodo)}
                    </TableCell>
                    <TableCell className="hidden text-right sm:table-cell">
                      {numero(i.linhasTotal)}
                    </TableCell>
                    <TableCell className="hidden text-right sm:table-cell">
                      {numero(i.linhasNaoMapeadas)}
                    </TableCell>
                    <TableCell>
                      <StatusImportacao importacao={i} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
