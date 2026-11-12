import {
  ROTULO_CANAL,
  ROTULO_MOTIVO_RESPOSTA,
  ROTULO_UNIDADE,
  type MetricasLoja,
} from '@giro/shared';
import { useState, type ReactNode } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
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
import { dataBr, dinheiro, numero, periodo } from '@/lib/formatar';
import { cn } from '@/lib/utils';
import { useMetricasCanais, useMetricasLoja } from './api';
import { GraficoBarras } from './graficos';

const pct = (n: number | null) => (n === null ? '—' : `${numero(n, 0)}%`);

function duracao(minutos: number | null): string {
  if (minutos === null) return '—';
  const m = Math.round(minutos);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const resto = m % 60;
  return resto === 0 ? `${h} h` : `${h} h ${resto} min`;
}

export function PaginaMetricas() {
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
          <h1 className="text-2xl font-semibold tracking-tight">Métricas do piloto</h1>
          <p className="text-sm text-muted-foreground">{loja.nome}</p>
        </div>
        <SeletorLoja lojas={lojas.data} loja={loja} escolher={escolher} />
      </div>
      <MetricasDaLoja key={loja.id} lojaId={loja.id} />
      <Canais />
    </div>
  );
}

function MetricasDaLoja({ lojaId }: { lojaId: number }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const metricas = useMetricasLoja(lojaId, from, to);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Período</CardTitle>
          <CardDescription>
            Se deixar em branco, o sistema escolhe o período padrão.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="metricas-de">De</Label>
            <Input
              id="metricas-de"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="metricas-ate">Até</Label>
            <Input
              id="metricas-ate"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {metricas.isPending && (
        <div className="grid gap-3 sm:grid-cols-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      )}
      {metricas.isError && (
        <Alert variant="destructive">
          <AlertDescription>{metricas.error.message}</AlertDescription>
        </Alert>
      )}
      {metricas.data && <Conteudo m={metricas.data} />}
    </div>
  );
}

function Cartao({
  titulo,
  valor,
  detalhe,
  meta,
  abaixo,
}: {
  titulo: string;
  valor: string;
  detalhe: ReactNode;
  meta: string;
  /** true = abaixo da meta (destaque); null = sem dado */
  abaixo: boolean | null;
}) {
  return (
    <Card className={cn(abaixo && 'border-destructive')}>
      <CardHeader>
        <CardDescription>{titulo}</CardDescription>
        <CardTitle className={cn('text-3xl tabular-nums', abaixo && 'text-destructive')}>
          {valor}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm">
        <div className="text-muted-foreground">{detalhe}</div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Meta: {meta}</span>
          {abaixo === true && <Badge variant="destructive">Abaixo da meta</Badge>}
          {abaixo === false && <Badge variant="secondary">Na meta</Badge>}
        </div>
      </CardContent>
    </Card>
  );
}

function Conteudo({ m }: { m: MetricasLoja }) {
  const { adesao, tempoResposta } = m;
  const semanasArquivo = m.arquivos;
  // dias por semana normalizado: semana parcial no começo/fim do período não puxa a média para baixo
  const diasNoPeriodo = semanasArquivo.reduce((s, a) => s + a.diasNoPeriodo, 0);
  const mediaArquivos =
    diasNoPeriodo === 0
      ? null
      : (semanasArquivo.reduce((s, a) => s + a.diasComVendas, 0) / diasNoPeriodo) * 7;
  const medianaOk =
    tempoResposta.medianaMinutos === null ? null : tempoResposta.medianaMinutos < 120;
  const inicio = m.inicioSugestoes;

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Período: {periodo(m.periodo.inicio, m.periodo.fim)} ·{' '}
        {inicio
          ? `sugestões começaram em ${dataBr(inicio)}`
          : 'ainda não foi enviada nenhuma sugestão'}
      </p>

      <section aria-label="Resumo" className="grid gap-3 sm:grid-cols-2">
        <Cartao
          titulo="Dias em que o dono respondeu"
          valor={pct(adesao.percentualDiasRespondidos)}
          detalhe={`${adesao.diasRespondidos} de ${adesao.diasComSugestaoEnviada} dias com sugestão enviada`}
          meta="60% ou mais"
          abaixo={
            adesao.percentualDiasRespondidos === null ? null : adesao.percentualDiasRespondidos < 60
          }
        />
        <Cartao
          titulo="Itens aceitos ou ajustados"
          valor={pct(adesao.percentualAceitosOuAjustados)}
          detalhe={`${adesao.itens.aceitos} aceitos, ${adesao.itens.ajustados} ajustados, ${adesao.itens.ignorados} ignorados, ${adesao.itens.semResposta} sem resposta (de ${adesao.itens.total} itens de pedido)`}
          meta="50% ou mais"
          abaixo={
            adesao.percentualAceitosOuAjustados === null
              ? null
              : adesao.percentualAceitosOuAjustados < 50
          }
        />
        <Cartao
          titulo="Tempo para responder (mediana)"
          valor={duracao(tempoResposta.medianaMinutos)}
          detalhe={`${pct(tempoResposta.percentualAte2h)} das respostas em até 2 h (${tempoResposta.respostas} respostas)`}
          meta="menos de 2 h"
          abaixo={medianaOk === null ? null : !medianaOk}
        />
        <Cartao
          titulo="Dias com arquivo de vendas por semana"
          valor={mediaArquivos === null ? '—' : numero(mediaArquivos, 1)}
          detalhe="Média por semana no período"
          meta="5 dias ou mais"
          abaixo={mediaArquivos === null ? null : mediaArquivos < 5}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Perda por semana</CardTitle>
          <CardDescription>
            Descartes registrados, somados por semana (começa na segunda).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <GraficoBarras
            titulo="Perda em R$"
            barras={m.perdas.semanas.map((s) => ({ semana: s.semana, valor: s.valor }))}
            formatar={dinheiro}
            cor="bg-destructive"
            inicioSugestoes={inicio}
          />
          <GraficoBarras
            titulo="Perda em kg (só itens vendidos em kg)"
            barras={m.perdas.semanas.map((s) => ({ semana: s.semana, valor: s.kg }))}
            formatar={(v) => `${numero(v)} kg`}
            cor="bg-primary"
            inicioSugestoes={inicio}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Faltas e arquivos por semana</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <GraficoBarras
            titulo="Itens em falta (rupturas)"
            barras={m.rupturas.map((r) => ({ semana: r.semana, valor: r.quantidade }))}
            formatar={(v) => numero(v, 0)}
            cor="bg-destructive"
            inicioSugestoes={inicio}
          />
          <GraficoBarras
            titulo="Dias com arquivo de vendas"
            barras={m.arquivos.map((a) => ({
              semana: a.semana,
              valor: a.diasComVendas,
              rotulo: `${a.diasComVendas} de ${a.diasNoPeriodo}`,
            }))}
            formatar={(v) => numero(v, 0)}
            inicioSugestoes={inicio}
            maximo={7}
            meta={5}
          />
        </CardContent>
      </Card>

      <AntesDurante m={m} />

      <Card>
        <CardHeader>
          <CardTitle>Motivos de ajuste</CardTitle>
          <CardDescription>Por que o dono mudou a quantidade sugerida.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {m.motivosAjuste.length === 0 ? (
            <p className="text-muted-foreground">Nenhum ajuste com motivo no período.</p>
          ) : (
            <ul aria-label="Motivos de ajuste" className="divide-y">
              {m.motivosAjuste.map((x) => (
                <li key={x.motivo} className="flex justify-between gap-3 py-2">
                  <span>{ROTULO_MOTIVO_RESPOSTA[x.motivo]}</span>
                  <span className="font-medium tabular-nums">{x.quantidade}</span>
                </li>
              ))}
            </ul>
          )}
          {m.notasAjuste.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-medium">Notas do dono</h3>
              <ul aria-label="Notas dos ajustes" className="divide-y">
                {m.notasAjuste.map((n, i) => (
                  <li key={`${n.data}-${i}`} className="py-2 text-sm">
                    <div className="text-muted-foreground">
                      {dataBr(n.data)} · {n.itemNome}
                    </div>
                    <div className="break-words">“{n.nota}”</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/** Variação % do valor semanal; negativo = perda caiu. */
function variacao(antes: number | undefined, durante: number | undefined): number | null {
  if (antes === undefined || durante === undefined || antes === 0) return null;
  return ((durante - antes) / antes) * 100;
}

function AntesDurante({ m }: { m: MetricasLoja }) {
  const linhas = m.perdas.porItem;
  const semAntes = linhas.length > 0 && linhas.every((l) => l.antesPorSemana === null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Perda por item: antes × durante</CardTitle>
        <CardDescription>
          Média por semana. “Antes” é a primeira semana de vendas importadas; “durante” é depois que
          as sugestões começaram. Variação negativa = perdeu menos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {linhas.length === 0 ? (
          <p className="text-muted-foreground">Sem perdas registradas para comparar.</p>
        ) : (
          <>
            {semAntes && (
              <p className="mb-3 text-sm text-muted-foreground">
                Ainda não há semana “antes” para comparar.
              </p>
            )}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Antes</TableHead>
                    <TableHead className="text-right">Durante</TableHead>
                    <TableHead className="text-right">Variação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l) => {
                    const v = variacao(l.antesPorSemana?.valor, l.durantePorSemana?.valor);
                    const un = ROTULO_UNIDADE[l.unidade];
                    return (
                      <TableRow key={l.itemId}>
                        <TableCell className="max-w-28 font-medium break-words whitespace-normal">
                          {l.itemNome}
                        </TableCell>
                        {[l.antesPorSemana, l.durantePorSemana].map((p, i) => (
                          <TableCell key={i} className="text-right tabular-nums">
                            {p ? (
                              <>
                                <div>{dinheiro(p.valor)}</div>
                                <div className="text-xs text-muted-foreground">
                                  {numero(p.quantidade)} {un}
                                </div>
                              </>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                        ))}
                        <TableCell
                          className={cn(
                            'text-right tabular-nums',
                            v !== null && (v < 0 ? 'font-medium' : v > 0 ? 'text-destructive' : ''),
                          )}
                        >
                          {v === null ? '—' : `${v > 0 ? '+' : ''}${numero(v, 0)}%`}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Canais() {
  const canais = useMetricasCanais();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Canal</CardTitle>
        <CardDescription>
          Os donos aceitam usar o Telegram? Compare a resposta por loja e canal.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {canais.isPending && <Skeleton className="h-16 w-full" />}
        {canais.isError && (
          <Alert variant="destructive">
            <AlertDescription>{canais.error.message}</AlertDescription>
          </Alert>
        )}
        {canais.data?.length === 0 && <p className="text-muted-foreground">Nenhuma loja.</p>}
        {canais.data && canais.data.length > 0 && (
          <ul aria-label="Resposta por loja e canal" className="divide-y">
            {canais.data.map((c) => (
              <li key={c.lojaId} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="font-medium break-words">{c.nome}</div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>{ROTULO_CANAL[c.canal]}</span>
                    {c.canal === 'telegram' && (
                      <Badge variant={c.telegramVinculado ? 'secondary' : 'outline'}>
                        {c.telegramVinculado ? 'Telegram vinculado' : 'Telegram não vinculado'}
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {c.diasComSugestaoEnviada} dias com sugestão enviada
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-semibold tabular-nums">
                    {pct(c.percentualDiasRespondidos)}
                  </div>
                  <div className="text-xs text-muted-foreground">dias respondidos</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
