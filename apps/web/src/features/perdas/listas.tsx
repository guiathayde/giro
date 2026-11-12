import { ROTULO_MOTIVO_PERDA, ROTULO_UNIDADE } from '@giro/shared';
import type { ReactNode } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { dataBr, dataHora, dinheiro, numero } from '@/lib/formatar';
import {
  useContagens,
  useExcluirContagem,
  useExcluirFalta,
  useExcluirPerda,
  useFaltas,
  usePerdas,
  type Periodo,
} from './api';
import { BotaoExcluir } from './campos';

function Estado({
  consulta,
  vazio,
  children,
}: {
  consulta: {
    isPending: boolean;
    isError: boolean;
    error: Error | null;
    data: unknown[] | undefined;
  };
  vazio: string;
  children: ReactNode;
}) {
  if (consulta.isPending)
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  if (consulta.isError)
    return (
      <Alert variant="destructive">
        <AlertDescription>{consulta.error?.message}</AlertDescription>
      </Alert>
    );
  if (consulta.data?.length === 0) return <p className="text-muted-foreground">{vazio}</p>;
  return <>{children}</>;
}

function Linha({
  titulo,
  detalhe,
  nota,
  acao,
}: {
  titulo: string;
  detalhe: string;
  nota?: string | null;
  acao: ReactNode;
}) {
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="font-medium break-words">{titulo}</div>
        <div className="text-sm text-muted-foreground">{detalhe}</div>
        {nota && <div className="text-sm break-words">“{nota}”</div>}
      </div>
      <div className="shrink-0">{acao}</div>
    </li>
  );
}

const Lista = ({ children, rotulo }: { children: ReactNode; rotulo: string }) => (
  <ul aria-label={rotulo} className="divide-y">
    {children}
  </ul>
);

export function ListaPerdas({ lojaId, periodo }: { lojaId: number; periodo: Periodo }) {
  const perdas = usePerdas(lojaId, periodo);
  const excluir = useExcluirPerda(lojaId);
  const dados = perdas.data ?? [];
  const totalValor = dados.reduce((s, p) => s + (p.valorEstimado ?? 0), 0);
  const semValor = dados.filter((p) => p.valorEstimado === null).length;
  const totalKg = dados.filter((p) => p.unidade === 'kg').reduce((s, p) => s + p.quantidade, 0);

  return (
    <div className="flex flex-col gap-3">
      <Estado consulta={perdas} vazio="Nenhum descarte neste período.">
        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted p-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Perda no período</dt>
            <dd className="text-lg font-semibold">{dinheiro(totalValor)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Itens em kg</dt>
            <dd className="text-lg font-semibold">{numero(totalKg)} kg</dd>
          </div>
          {semValor > 0 && (
            <p className="col-span-2 text-xs text-muted-foreground">
              {semValor} {semValor === 1 ? 'descarte está' : 'descartes estão'} sem valor, porque o
              item não tem custo cadastrado.
            </p>
          )}
        </dl>
        <Lista rotulo="Descartes do período">
          {dados.map((p) => (
            <Linha
              key={p.id}
              titulo={`${p.itemNome} — ${numero(p.quantidade)} ${ROTULO_UNIDADE[p.unidade]}`}
              detalhe={`${dataBr(p.data)} · ${ROTULO_MOTIVO_PERDA[p.motivo]} · ${dinheiro(p.valorEstimado)}`}
              nota={p.nota}
              acao={
                <BotaoExcluir
                  descricao={`descarte de ${p.itemNome} em ${dataBr(p.data)}`}
                  desabilitado={excluir.isPending}
                  aoConfirmar={() => excluir.mutate(p.id)}
                />
              }
            />
          ))}
        </Lista>
      </Estado>
      {excluir.isError && (
        <Alert variant="destructive">
          <AlertDescription>{excluir.error.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export function ListaFaltas({ lojaId, periodo }: { lojaId: number; periodo: Periodo }) {
  const faltas = useFaltas(lojaId, periodo);
  const excluir = useExcluirFalta(lojaId);
  return (
    <div className="flex flex-col gap-3">
      <Estado consulta={faltas} vazio="Nenhuma falta neste período.">
        <p className="text-sm text-muted-foreground">
          {faltas.data?.length} {faltas.data?.length === 1 ? 'falta' : 'faltas'} no período.
        </p>
        <Lista rotulo="Faltas do período">
          {faltas.data?.map((f) => (
            <Linha
              key={f.id}
              titulo={f.itemNome}
              detalhe={dataBr(f.data)}
              nota={f.nota}
              acao={
                <BotaoExcluir
                  descricao={`falta de ${f.itemNome} em ${dataBr(f.data)}`}
                  desabilitado={excluir.isPending}
                  aoConfirmar={() => excluir.mutate(f.id)}
                />
              }
            />
          ))}
        </Lista>
      </Estado>
      {excluir.isError && (
        <Alert variant="destructive">
          <AlertDescription>{excluir.error.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export function ListaContagens({ lojaId, periodo }: { lojaId: number; periodo: Periodo }) {
  const contagens = useContagens(lojaId, periodo);
  const excluir = useExcluirContagem(lojaId);
  return (
    <div className="flex flex-col gap-3">
      <Estado consulta={contagens} vazio="Nenhuma contagem neste período.">
        <Lista rotulo="Contagens do período">
          {contagens.data?.map((c) => (
            <Linha
              key={c.id}
              titulo={`${c.itemNome} — ${numero(c.quantidade)} ${ROTULO_UNIDADE[c.unidade]}`}
              detalhe={`${dataHora(c.contadoEm)} · ${c.origem === 'operator' ? 'painel' : 'bot'}`}
              acao={
                <BotaoExcluir
                  descricao={`contagem de ${c.itemNome}`}
                  desabilitado={excluir.isPending}
                  aoConfirmar={() => excluir.mutate(c.id)}
                />
              }
            />
          ))}
        </Lista>
      </Estado>
      {excluir.isError && (
        <Alert variant="destructive">
          <AlertDescription>{excluir.error.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
