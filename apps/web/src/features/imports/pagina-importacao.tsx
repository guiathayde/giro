import type {
  ColunasDetectadas,
  DetalheImportacao,
  Item,
  MapeamentoColunas,
  NaoMapeado,
} from '@giro/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { SelectNativo } from '@/components/select-nativo';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useItens, useSalvarMapeamentoColunas } from '@/features/stores/api';
import { dataBr, dataHora, dinheiro, numero, periodo } from '@/lib/formatar';
import { useImportacao, useMapear, useReprocessar } from './api';
import { ORIGEM, UNIDADE } from './rotulos';
import { StatusImportacao } from './status';

export function PaginaImportacao() {
  const id = Number(useParams().id);
  const detalhe = useImportacao(id);

  if (detalhe.isPending) return <p className="text-muted-foreground">Carregando…</p>;
  if (detalhe.isError) return <p className="text-destructive">{detalhe.error.message}</p>;

  const { importacao } = detalhe.data;
  const ignoradas =
    importacao.linhasTotal - importacao.linhasMapeadas - importacao.linhasNaoMapeadas;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to={`/importar?loja=${importacao.lojaId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Importações
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight break-all">
            {importacao.nomeArquivo ?? `Importação #${importacao.id}`}
          </h1>
          <StatusImportacao importacao={importacao} />
        </div>
        <p className="text-sm text-muted-foreground">
          {ORIGEM[importacao.origem]} · recebido {dataHora(importacao.criadoEm)}
        </p>
      </div>

      {importacao.status === 'error' && (
        <Alert variant="destructive">
          <AlertTitle>Não deu para ler o arquivo</AlertTitle>
          <AlertDescription>{importacao.erro}</AlertDescription>
        </Alert>
      )}

      {importacao.status === 'done' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Numero
            rotulo="Período"
            valor={periodo(importacao.inicioPeriodo, importacao.fimPeriodo)}
          />
          <Numero rotulo="Linhas de venda" valor={numero(importacao.linhasTotal)} />
          <Numero rotulo="Reconhecidas" valor={numero(importacao.linhasMapeadas)} />
          <Numero rotulo="A mapear" valor={numero(importacao.linhasNaoMapeadas)} />
          <Numero rotulo="Ignoradas" valor={numero(ignoradas)} />
        </div>
      )}

      {importacao.status === 'done' && <Descartadas descartadas={detalhe.data.descartadas} />}

      {detalhe.data.naoMapeados.length > 0 && (
        <FilaMapeamento
          key={detalhe.data.naoMapeados.map((n) => n.normalizada).join('|')}
          importacaoId={id}
          lojaId={importacao.lojaId}
          naoMapeados={detalhe.data.naoMapeados}
        />
      )}

      {/* remonta quando o status muda, para fechar o formulário depois de reprocessar */}
      <Colunas key={importacao.status} detalhe={detalhe.data} />

      {detalhe.data.previa.length > 0 && <Previa detalhe={detalhe.data} />}
    </div>
  );
}

/** Linhas fora da tabela de vendas. "linha de total" é esperado; o resto merece atenção. */
function Descartadas({ descartadas }: { descartadas: DetalheImportacao['descartadas'] }) {
  if (descartadas.length === 0) return null;
  const texto = descartadas.map((d) => `${d.motivo} (${numero(d.linhas)})`).join(', ');
  const soTotais = descartadas.every((d) => d.motivo === 'linha de total');
  if (soTotais) {
    return <p className="text-sm text-muted-foreground">Linhas fora da tabela: {texto}.</p>;
  }
  const total = descartadas.reduce((s, d) => s + d.linhas, 0);
  return (
    <Alert>
      <AlertTitle>
        {numero(total)} {total === 1 ? 'linha ficou' : 'linhas ficaram'} de fora
      </AlertTitle>
      <AlertDescription>
        {texto}. Se forem vendas de verdade, confira as colunas abaixo.
      </AlertDescription>
    </Alert>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div className="font-medium">{valor}</div>
    </div>
  );
}

// ---------- fila "mapear" ----------

const IGNORAR = 'ignorar';

function FilaMapeamento({
  importacaoId,
  lojaId,
  naoMapeados,
}: {
  importacaoId: number;
  lojaId: number;
  naoMapeados: NaoMapeado[];
}) {
  const itens = useItens(lojaId);
  const mapear = useMapear(importacaoId);
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});

  const mapeamentos = Object.entries(escolhas)
    .filter(([, valor]) => valor !== '')
    .map(([normalizada, valor]) => ({
      normalizada,
      itemId: valor === IGNORAR ? null : Number(valor),
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Produtos não reconhecidos</CardTitle>
        <CardDescription>
          Diga a qual item cada descrição do PDV corresponde. Ela vira um apelido do item e as
          próximas importações reconhecem sozinhas. O que não é hortifruti (mercearia, sacola) pode
          ser ignorado.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col divide-y">
          {naoMapeados.map((n) => (
            <li
              key={n.normalizada}
              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="font-medium break-words">{n.descricao}</div>
                <div className="text-xs text-muted-foreground">
                  {n.linhas} {n.linhas === 1 ? 'linha' : 'linhas'} · {numero(n.quantidade)} vendidos
                  {n.codigo && ` · cód. ${n.codigo}`}
                </div>
              </div>
              <SelectNativo
                aria-label={`Item para ${n.descricao}`}
                className="sm:max-w-64"
                value={escolhas[n.normalizada] ?? ''}
                onChange={(e) =>
                  setEscolhas((atual) => ({ ...atual, [n.normalizada]: e.target.value }))
                }
              >
                <option value="">Escolher…</option>
                <option value={IGNORAR}>Ignorar (não é hortifruti)</option>
                <OpcoesItens itens={itens.data} />
              </SelectNativo>
            </li>
          ))}
        </ul>
        {mapear.isError && (
          <Alert variant="destructive">
            <AlertDescription>{mapear.error.message}</AlertDescription>
          </Alert>
        )}
        <div>
          <Button
            disabled={mapeamentos.length === 0 || mapear.isPending}
            onClick={() => mapear.mutate({ mapeamentos })}
          >
            {mapear.isPending
              ? 'Salvando…'
              : `Salvar ${mapeamentos.length || ''} ${mapeamentos.length === 1 ? 'escolha' : 'escolhas'}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OpcoesItens({ itens }: { itens: Item[] | undefined }) {
  if (!itens) return null;
  return (
    <optgroup label="Itens da loja">
      {itens
        .filter((i) => i.ativo)
        .map((i) => (
          <option key={i.id} value={i.id}>
            {i.nome} ({UNIDADE[i.unidade]})
          </option>
        ))}
    </optgroup>
  );
}

// ---------- colunas ----------

const PAPEIS: { chave: keyof ColunasDetectadas; rotulo: string; obrigatorio?: boolean }[] = [
  { chave: 'descricao', rotulo: 'Descrição do produto', obrigatorio: true },
  { chave: 'quantidade', rotulo: 'Quantidade vendida', obrigatorio: true },
  { chave: 'data', rotulo: 'Data da venda' },
  { chave: 'valor', rotulo: 'Valor total' },
  { chave: 'codigo', rotulo: 'Código do produto' },
];

function Colunas({ detalhe }: { detalhe: DetalheImportacao }) {
  const { importacao, colunas, cabecalhos } = detalhe;
  const podeMapear = cabecalhos.length > 0;
  const [editando, setEditando] = useState(importacao.status === 'error' && podeMapear);

  if (!colunas && !podeMapear) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Colunas do arquivo</CardTitle>
        <CardDescription>
          {colunas
            ? 'Como o sistema leu o arquivo. Se alguma coluna estiver errada, ajuste e reprocesse.'
            : 'Não reconheci as colunas sozinho. Diga qual é qual: fica salvo para os próximos arquivos desta loja.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {colunas && !editando && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {PAPEIS.map((p) => (
              <div key={p.chave} className="contents">
                <dt className="text-muted-foreground">{p.rotulo}</dt>
                <dd>{colunas[p.chave] ?? '—'}</dd>
              </div>
            ))}
          </dl>
        )}
        {editando ? (
          <FormColunas
            importacaoId={importacao.id}
            lojaId={importacao.lojaId}
            cabecalhos={cabecalhos}
            inicial={colunas}
            aoCancelar={colunas ? () => setEditando(false) : undefined}
          />
        ) : (
          <div>
            <Button variant="outline" size="sm" onClick={() => setEditando(true)}>
              Ajustar colunas
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FormColunas({
  importacaoId,
  lojaId,
  cabecalhos,
  inicial,
  aoCancelar,
}: {
  importacaoId: number;
  lojaId: number;
  cabecalhos: string[];
  inicial: ColunasDetectadas | null;
  aoCancelar?: () => void;
}) {
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(PAPEIS.map((p) => [p.chave, inicial?.[p.chave] ?? ''])),
  );
  const salvar = useSalvarMapeamentoColunas(lojaId);
  const reprocessar = useReprocessar(importacaoId);
  const pendente = salvar.isPending || reprocessar.isPending;
  const erro = salvar.error ?? reprocessar.error;
  const completo = Boolean(valores.descricao && valores.quantidade);

  async function aplicar() {
    const mapeamento: MapeamentoColunas = {
      descricao: valores.descricao ?? '',
      quantidade: valores.quantidade ?? '',
      data: valores.data || null,
      valor: valores.valor || null,
      codigo: valores.codigo || null,
    };
    await salvar.mutateAsync(mapeamento);
    await reprocessar.mutateAsync();
    aoCancelar?.();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {PAPEIS.map((p) => (
          <div key={p.chave} className="flex flex-col gap-1.5">
            <Label htmlFor={`coluna-${p.chave}`}>
              {p.rotulo}
              {p.obrigatorio && ' *'}
            </Label>
            <SelectNativo
              id={`coluna-${p.chave}`}
              value={valores[p.chave] ?? ''}
              onChange={(e) => setValores((v) => ({ ...v, [p.chave]: e.target.value }))}
            >
              <option value="">{p.obrigatorio ? 'Escolher…' : 'Não tem / detectar'}</option>
              {cabecalhos.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectNativo>
          </div>
        ))}
      </div>
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro.message}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button disabled={!completo || pendente} onClick={() => void aplicar()}>
          {pendente ? 'Reprocessando…' : 'Salvar e reprocessar'}
        </Button>
        {aoCancelar && (
          <Button variant="ghost" onClick={aoCancelar} disabled={pendente}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------- prévia ----------

function Previa({ detalhe }: { detalhe: DetalheImportacao }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Prévia</CardTitle>
        <CardDescription>
          Vendas somadas por dia e descrição (até 100 linhas, as mais recentes primeiro).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição no PDV</TableHead>
                <TableHead className="text-right">Qtde</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Item</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detalhe.previa.map((l) => (
                <TableRow key={`${l.data}|${l.descricao}`}>
                  <TableCell className="whitespace-nowrap">{dataBr(l.data)}</TableCell>
                  <TableCell>{l.descricao}</TableCell>
                  <TableCell className="text-right">{numero(l.quantidade)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {dinheiro(l.valor)}
                  </TableCell>
                  <TableCell>
                    {l.itemNome ?? (
                      <Badge variant={l.ignorada ? 'secondary' : 'outline'}>
                        {l.ignorada ? 'ignorado' : 'a mapear'}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
