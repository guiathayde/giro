import {
  ROTULO_TIPO_EVENTO,
  TIPOS_EVENTO,
  novoEventoSchema,
  type Loja,
  type TipoEvento,
} from '@giro/shared';
import { useState, type FormEvent } from 'react';
import { SelectNativo } from '@/components/select-nativo';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { dataBr, numero } from '@/lib/formatar';
import { DIAS_EVENTOS, useCriarEvento, useEventos, useExcluirEvento } from './api';
import { Campo } from './campo';
import { errosPorCampo, hojeIso, lerNumero } from './util';

export function EventosLoja({ loja }: { loja: Loja }) {
  const hoje = hojeIso();
  const eventos = useEventos(loja.id, hoje);
  const excluir = useExcluirEvento(loja.id);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-medium">Eventos de calendário</h3>
        <p className="text-xs text-muted-foreground">
          Feriados, feiras e eventos dos próximos {DIAS_EVENTOS} dias. O Giro usa o fator para
          ajustar a previsão de venda do dia.
        </p>
      </div>
      {eventos.isPending && <Skeleton className="h-10 w-full" />}
      {eventos.isError && <p className="text-sm text-destructive">{eventos.error.message}</p>}
      {eventos.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum evento nos próximos dias.</p>
      )}
      {eventos.data && eventos.data.length > 0 && (
        <ul className="flex flex-col divide-y rounded-md border">
          {eventos.data.map((ev) => (
            <li key={ev.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {dataBr(ev.data)} · {ev.descricao}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{ROTULO_TIPO_EVENTO[ev.tipo]}</span>
                  <span>· vende x{numero(ev.fatorDemanda, 2)}</span>
                  {ev.lojaId === null && <Badge variant="secondary">todas as lojas</Badge>}
                </div>
              </div>
              {ev.lojaId !== null && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Excluir evento ${ev.descricao} de ${dataBr(ev.data)}`}
                  disabled={excluir.isPending && excluir.variables === ev.id}
                  onClick={() => excluir.mutate(ev.id)}
                >
                  Excluir
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {excluir.isError && (
        <Alert variant="destructive">
          <AlertDescription>{excluir.error.message}</AlertDescription>
        </Alert>
      )}
      <FormEvento loja={loja} hoje={hoje} />
    </div>
  );
}

function FormEvento({ loja, hoje }: { loja: Loja; hoje: string }) {
  const criar = useCriarEvento(loja.id);
  const [data, setData] = useState(hoje);
  const [tipo, setTipo] = useState<TipoEvento>('holiday');
  const [descricao, setDescricao] = useState('');
  const [fator, setFator] = useState('1');
  const [erros, setErros] = useState<Record<string, string>>({});
  const p = `evento-${loja.id}`;

  function enviar(e: FormEvent) {
    e.preventDefault();
    const n = lerNumero(fator);
    if (n !== null && Number.isNaN(n))
      return setErros({ fatorDemanda: 'Digite um número, ex.: 1,3' });
    const r = novoEventoSchema.safeParse({
      lojaId: loja.id,
      data,
      tipo,
      descricao,
      fatorDemanda: n ?? 1,
    });
    if (!r.success) return setErros(errosPorCampo(r.error));
    setErros({});
    criar.mutate(r.data, {
      onSuccess: () => {
        setDescricao('');
        setFator('1');
      },
    });
  }

  return (
    <form
      onSubmit={enviar}
      noValidate
      className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-2"
    >
      <Campo id={`${p}-data`} rotulo="Data" erro={erros.data}>
        {(props) => (
          <Input {...props} type="date" value={data} onChange={(e) => setData(e.target.value)} />
        )}
      </Campo>
      <Campo id={`${p}-tipo`} rotulo="Tipo" erro={erros.tipo}>
        {(props) => (
          <SelectNativo
            {...props}
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoEvento)}
          >
            {TIPOS_EVENTO.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO_EVENTO[t]}
              </option>
            ))}
          </SelectNativo>
        )}
      </Campo>
      <Campo id={`${p}-descricao`} rotulo="Descrição" erro={erros.descricao}>
        {(props) => (
          <Input
            {...props}
            value={descricao}
            placeholder="Ex.: feira da cidade"
            onChange={(e) => setDescricao(e.target.value)}
          />
        )}
      </Campo>
      <Campo
        id={`${p}-fator`}
        rotulo="Fator de demanda"
        ajuda="1 = normal, 1,3 = vende 30% mais"
        erro={erros.fatorDemanda}
      >
        {(props) => (
          <Input
            {...props}
            inputMode="decimal"
            value={fator}
            onChange={(e) => setFator(e.target.value)}
          />
        )}
      </Campo>
      {criar.isError && (
        <Alert variant="destructive" className="sm:col-span-2">
          <AlertDescription>{criar.error.message}</AlertDescription>
        </Alert>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" disabled={criar.isPending}>
          {criar.isPending ? 'Adicionando…' : 'Adicionar evento'}
        </Button>
      </div>
    </form>
  );
}
