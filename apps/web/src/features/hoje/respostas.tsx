import {
  MOTIVOS_RESPOSTA,
  ROTULO_MOTIVO_RESPOSTA,
  ROTULO_UNIDADE,
  registrarRespostaSchema,
  type ItemSugestao,
  type MotivoResposta,
  type Sugestao,
} from '@giro/shared';
import { useState, type FormEvent } from 'react';
import { SelectNativo } from '@/components/select-nativo';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Campo } from '@/features/lojas/campo';
import { errosPorCampo, lerNumero, numeroParaCampo } from '@/features/lojas/util';
import { numero } from '@/lib/formatar';
import { useAceitarTudo, useRegistrarResposta } from './api';

const quantidade = (n: number, item: ItemSugestao) =>
  `${numero(n)} ${ROTULO_UNIDADE[item.unidade]}`;

/** Registro das respostas do dono (fallback manual) e listas de encalhe e "não repor". */
export function Respostas({ sugestao }: { sugestao: Sugestao }) {
  const aceitarTudo = useAceitarTudo(sugestao.id);
  const liberado = sugestao.status !== 'draft';
  const pedidos = sugestao.itens
    .filter((i) => i.acao === 'order')
    .sort((a, b) => (a.posicao ?? 999) - (b.posicao ?? 999));
  const encalhes = sugestao.itens.filter((i) => i.acao === 'risk');
  const naoRepor = sugestao.itens.filter((i) => i.acao === 'skip');
  const respondidos = pedidos.filter((i) => i.resposta !== null).length;

  return (
    <div className="flex flex-col gap-4">
      {encalhes.length > 0 && (
        <section aria-label="Encalhe" className="flex flex-col gap-1">
          <h4 className="text-sm font-medium">Encalhe: vendendo abaixo do ritmo</h4>
          <ul className="flex flex-col gap-0.5 text-sm">
            {encalhes.map((i) => (
              <li key={i.id}>
                <span className="font-medium">{i.itemNome}</span>
                {i.motivo && <span className="text-muted-foreground"> — {i.motivo}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Pedidos" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-medium">
            Pedidos{' '}
            <span className="font-normal text-muted-foreground">
              ({respondidos} de {pedidos.length} respondidos)
            </span>
          </h4>
          {pedidos.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => aceitarTudo.mutate()}
              disabled={!liberado || aceitarTudo.isPending}
            >
              {aceitarTudo.isPending ? 'Aceitando…' : 'Aceitar tudo'}
            </Button>
          )}
        </div>
        {!liberado && (
          <Alert>
            <AlertDescription>
              Para registrar as respostas do dono, primeiro envie a mensagem (ou marque como
              enviada).
            </AlertDescription>
          </Alert>
        )}
        {aceitarTudo.isError && (
          <Alert variant="destructive">
            <AlertDescription>{aceitarTudo.error.message}</AlertDescription>
          </Alert>
        )}
        {pedidos.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum pedido sugerido hoje.</p>
        )}
        {pedidos.length > 0 && (
          <ul className="flex flex-col divide-y rounded-md border">
            {pedidos.map((item, indice) => (
              <ItemPedido
                key={item.id}
                item={item}
                numeroNaLista={indice + 1}
                liberado={liberado}
              />
            ))}
          </ul>
        )}
      </section>

      {naoRepor.length > 0 && (
        <section aria-label="Não repor" className="flex flex-col gap-1">
          <h4 className="text-sm font-medium">Não repor hoje</h4>
          <p className="text-sm text-muted-foreground">
            {naoRepor.map((i) => i.itemNome).join(', ')}
          </p>
        </section>
      )}
    </div>
  );
}

function RespostaAtual({ item }: { item: ItemSugestao }) {
  if (item.resposta === 'accepted') return <Badge>Aceito</Badge>;
  if (item.resposta === 'ignored') return <Badge variant="outline">Ignorado</Badge>;
  if (item.resposta === 'adjusted')
    return (
      <Badge variant="secondary">
        Ajustado:{' '}
        {item.quantidadeResposta === null ? '—' : quantidade(item.quantidadeResposta, item)}
        {item.motivoResposta && ` (${ROTULO_MOTIVO_RESPOSTA[item.motivoResposta]})`}
      </Badge>
    );
  return <span className="text-xs text-muted-foreground">sem resposta</span>;
}

function ItemPedido({
  item,
  numeroNaLista,
  liberado,
}: {
  item: ItemSugestao;
  numeroNaLista: number;
  liberado: boolean;
}) {
  const registrar = useRegistrarResposta(item.id);
  const [ajustando, setAjustando] = useState(false);

  return (
    <li className="flex flex-col gap-2 p-3">
      <div>
        <div className="font-medium">
          {item.posicao ?? numeroNaLista}. {item.itemNome} —{' '}
          {quantidade(item.quantidadeSugerida, item)}
        </div>
        {item.motivo && <div className="text-xs text-muted-foreground">{item.motivo}</div>}
        {item.estimativaFraca && (
          <div className="text-xs text-amber-700 dark:text-amber-400">
            ⚠ estimativa fraca (sem contagem recente do estoque)
          </div>
        )}
        {item.notaResposta && (
          <div className="text-xs text-muted-foreground">Nota: {item.notaResposta}</div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <RespostaAtual item={item} />
      </div>
      {liberado && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={item.resposta === 'accepted' ? 'default' : 'outline'}
            disabled={registrar.isPending}
            onClick={() => {
              setAjustando(false);
              registrar.mutate({ resposta: 'accepted' });
            }}
          >
            Aceito
          </Button>
          <Button
            size="sm"
            variant={item.resposta === 'adjusted' || ajustando ? 'default' : 'outline'}
            disabled={registrar.isPending}
            aria-expanded={ajustando}
            onClick={() => setAjustando(!ajustando)}
          >
            Ajustar
          </Button>
          <Button
            size="sm"
            variant={item.resposta === 'ignored' ? 'default' : 'outline'}
            disabled={registrar.isPending}
            onClick={() => {
              setAjustando(false);
              registrar.mutate({ resposta: 'ignored' });
            }}
          >
            Ignorado
          </Button>
        </div>
      )}
      {liberado && ajustando && (
        <FormAjuste
          item={item}
          pendente={registrar.isPending}
          enviar={(resposta) =>
            registrar.mutate(resposta, { onSuccess: () => setAjustando(false) })
          }
        />
      )}
      {registrar.isError && (
        <Alert variant="destructive">
          <AlertDescription>{registrar.error.message}</AlertDescription>
        </Alert>
      )}
    </li>
  );
}

function FormAjuste({
  item,
  pendente,
  enviar,
}: {
  item: ItemSugestao;
  pendente: boolean;
  enviar: (r: ReturnType<typeof registrarRespostaSchema.parse>) => void;
}) {
  const [qtd, setQtd] = useState(
    numeroParaCampo(item.quantidadeResposta ?? item.quantidadeSugerida),
  );
  const [motivo, setMotivo] = useState<MotivoResposta | ''>(item.motivoResposta ?? '');
  const [nota, setNota] = useState(item.notaResposta ?? '');
  const [erros, setErros] = useState<Record<string, string>>({});
  const p = `ajuste-${item.id}`;

  function salvar(e: FormEvent) {
    e.preventDefault();
    const n = lerNumero(qtd);
    if (n === null || Number.isNaN(n) || n < 0)
      return setErros({ quantidade: 'Digite a quantidade, ex.: 35 ou 2,5' });
    const r = registrarRespostaSchema.safeParse({
      resposta: 'adjusted',
      quantidade: n,
      motivo: motivo || null,
      nota: nota.trim() || null,
    });
    if (!r.success) return setErros(errosPorCampo(r.error));
    setErros({});
    enviar(r.data);
  }

  return (
    <form
      onSubmit={salvar}
      noValidate
      className="grid gap-3 rounded-md bg-muted/40 p-3 sm:grid-cols-2"
    >
      <Campo
        id={`${p}-qtd`}
        rotulo={`Quantidade (${ROTULO_UNIDADE[item.unidade]})`}
        erro={erros.quantidade}
      >
        {(props) => (
          <Input
            {...props}
            inputMode="decimal"
            value={qtd}
            onChange={(e) => setQtd(e.target.value)}
          />
        )}
      </Campo>
      <Campo id={`${p}-motivo`} rotulo="Motivo" erro={erros.motivo}>
        {(props) => (
          <SelectNativo
            {...props}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value as MotivoResposta | '')}
          >
            <option value="">Sem motivo</option>
            {MOTIVOS_RESPOSTA.map((m) => (
              <option key={m} value={m}>
                {ROTULO_MOTIVO_RESPOSTA[m]}
              </option>
            ))}
          </SelectNativo>
        )}
      </Campo>
      <div className="sm:col-span-2">
        <Campo id={`${p}-nota`} rotulo="Nota (opcional)" erro={erros.nota}>
          {(props) => <Input {...props} value={nota} onChange={(e) => setNota(e.target.value)} />}
        </Campo>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? 'Salvando…' : 'Salvar ajuste'}
        </Button>
      </div>
    </form>
  );
}
