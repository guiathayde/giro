import {
  MOTIVOS_PERDA,
  ROTULO_MOTIVO_PERDA,
  ROTULO_UNIDADE,
  novaContagemSchema,
  novaFaltaSchema,
  novaPerdaSchema,
  type Item,
  type MotivoPerda,
} from '@giro/shared';
import { useState, type FormEvent } from 'react';
import { SelectNativo } from '@/components/select-nativo';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useRegistrarContagem, useRegistrarFalta, useRegistrarPerda } from './api';
import { Campo, SelecaoItem } from './campos';
import { hojeIso, lerNumero, primeiroErroPorCampo } from './util';

type Erros = Record<string, string>;

const MSG_ITEM = 'Escolha o item.';
const MSG_QTD = 'Digite uma quantidade maior que zero.';
const MSG_DATA = 'Escolha uma data válida.';

function Rodape({
  pendente,
  erroApi,
  sucesso,
  rotulo,
}: {
  pendente: boolean;
  erroApi: string | undefined;
  sucesso: boolean;
  rotulo: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Button type="submit" disabled={pendente} className="w-full sm:w-fit">
        {pendente ? 'Salvando…' : rotulo}
      </Button>
      {erroApi && (
        <Alert variant="destructive">
          <AlertDescription>{erroApi}</AlertDescription>
        </Alert>
      )}
      {sucesso && !erroApi && (
        <p role="status" className="text-sm text-muted-foreground">
          Registrado.
        </p>
      )}
    </div>
  );
}

export function FormDescarte({ lojaId, itens }: { lojaId: number; itens: Item[] }) {
  const [itemId, setItemId] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [motivo, setMotivo] = useState<MotivoPerda>('spoiled');
  const [data, setData] = useState(hojeIso);
  const [nota, setNota] = useState('');
  const [erros, setErros] = useState<Erros>({});
  const registrar = useRegistrarPerda(lojaId);
  const item = itens.find((i) => String(i.id) === itemId);

  function aoEnviar(e: FormEvent) {
    e.preventDefault();
    registrar.reset();
    const n = lerNumero(quantidade);
    const r = novaPerdaSchema.safeParse({
      itemId: itemId ? Number(itemId) : undefined,
      quantidade: n ?? undefined,
      motivo,
      data: data || undefined,
      nota: nota.trim() || null,
    });
    if (!r.success) {
      const c = primeiroErroPorCampo(r.error.issues);
      setErros({
        ...(c.itemId && { item: MSG_ITEM }),
        ...(c.quantidade && { quantidade: MSG_QTD }),
        ...(c.data && { data: MSG_DATA }),
        ...(c.motivo && { motivo: 'Escolha o motivo.' }),
        ...(c.nota && { nota: 'A nota é longa demais (máximo 500 letras).' }),
      });
      return;
    }
    setErros({});
    registrar.mutate(r.data, {
      onSuccess: () => {
        setQuantidade('');
        setNota('');
      },
    });
  }

  return (
    <form onSubmit={aoEnviar} noValidate className="flex flex-col gap-4">
      <Campo rotulo="Item" erro={erros.item}>
        {(p) => <SelecaoItem itens={itens} valor={itemId} aoMudar={setItemId} props={p} />}
      </Campo>
      <Campo rotulo="Quantidade descartada" erro={erros.quantidade}>
        {(p) => (
          <div className="flex items-center gap-2">
            <Input
              {...p}
              inputMode="decimal"
              placeholder="0,0"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
            />
            <span className="w-12 text-sm text-muted-foreground">
              {item ? ROTULO_UNIDADE[item.unidade] : ''}
            </span>
          </div>
        )}
      </Campo>
      <Campo rotulo="Motivo" erro={erros.motivo}>
        {(p) => (
          <SelectNativo
            {...p}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value as MotivoPerda)}
          >
            {MOTIVOS_PERDA.map((m) => (
              <option key={m} value={m}>
                {ROTULO_MOTIVO_PERDA[m]}
              </option>
            ))}
          </SelectNativo>
        )}
      </Campo>
      <Campo rotulo="Data" erro={erros.data}>
        {(p) => <Input {...p} type="date" value={data} onChange={(e) => setData(e.target.value)} />}
      </Campo>
      <Campo rotulo="Nota (opcional)" erro={erros.nota}>
        {(p) => <Textarea {...p} rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />}
      </Campo>
      <Rodape
        pendente={registrar.isPending}
        erroApi={registrar.error?.message}
        sucesso={registrar.isSuccess}
        rotulo="Registrar descarte"
      />
    </form>
  );
}

export function FormFalta({ lojaId, itens }: { lojaId: number; itens: Item[] }) {
  const [itemId, setItemId] = useState('');
  const [data, setData] = useState(hojeIso);
  const [nota, setNota] = useState('');
  const [erros, setErros] = useState<Erros>({});
  const registrar = useRegistrarFalta(lojaId);

  function aoEnviar(e: FormEvent) {
    e.preventDefault();
    registrar.reset();
    const r = novaFaltaSchema.safeParse({
      itemId: itemId ? Number(itemId) : undefined,
      data: data || undefined,
      nota: nota.trim() || null,
    });
    if (!r.success) {
      const c = primeiroErroPorCampo(r.error.issues);
      setErros({
        ...(c.itemId && { item: MSG_ITEM }),
        ...(c.data && { data: MSG_DATA }),
        ...(c.nota && { nota: 'A nota é longa demais (máximo 500 letras).' }),
      });
      return;
    }
    setErros({});
    registrar.mutate(r.data, { onSuccess: () => setNota('') });
  }

  return (
    <form onSubmit={aoEnviar} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Use quando o produto acabou e faltou para o cliente.
      </p>
      <Campo rotulo="Item que faltou" erro={erros.item}>
        {(p) => <SelecaoItem itens={itens} valor={itemId} aoMudar={setItemId} props={p} />}
      </Campo>
      <Campo rotulo="Data" erro={erros.data}>
        {(p) => <Input {...p} type="date" value={data} onChange={(e) => setData(e.target.value)} />}
      </Campo>
      <Campo rotulo="Nota (opcional)" erro={erros.nota}>
        {(p) => <Textarea {...p} rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />}
      </Campo>
      <Rodape
        pendente={registrar.isPending}
        erroApi={registrar.error?.message}
        sucesso={registrar.isSuccess}
        rotulo="Registrar falta"
      />
    </form>
  );
}

export function FormContagem({ lojaId, itens }: { lojaId: number; itens: Item[] }) {
  const [itemId, setItemId] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [erros, setErros] = useState<Erros>({});
  const registrar = useRegistrarContagem(lojaId);
  const item = itens.find((i) => String(i.id) === itemId);

  function aoEnviar(e: FormEvent) {
    e.preventDefault();
    registrar.reset();
    const n = lerNumero(quantidade);
    const r = novaContagemSchema.safeParse({
      itemId: itemId ? Number(itemId) : undefined,
      quantidade: n ?? undefined,
    });
    if (!r.success) {
      const c = primeiroErroPorCampo(r.error.issues);
      setErros({
        ...(c.itemId && { item: MSG_ITEM }),
        ...(c.quantidade && { quantidade: 'Digite quanto tem no estoque (zero também vale).' }),
      });
      return;
    }
    setErros({});
    registrar.mutate(r.data, { onSuccess: () => setQuantidade('') });
  }

  return (
    <form onSubmit={aoEnviar} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Quanto tem de cada item agora. O sistema usa isso para corrigir o estoque estimado.
      </p>
      <Campo rotulo="Item" erro={erros.item}>
        {(p) => <SelecaoItem itens={itens} valor={itemId} aoMudar={setItemId} props={p} />}
      </Campo>
      <Campo rotulo="Quantidade no estoque" erro={erros.quantidade}>
        {(p) => (
          <div className="flex items-center gap-2">
            <Input
              {...p}
              inputMode="decimal"
              placeholder="0,0"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
            />
            <span className="w-12 text-sm text-muted-foreground">
              {item ? ROTULO_UNIDADE[item.unidade] : ''}
            </span>
          </div>
        )}
      </Campo>
      <Rodape
        pendente={registrar.isPending}
        erroApi={registrar.error?.message}
        sucesso={registrar.isSuccess}
        rotulo="Registrar contagem"
      />
    </form>
  );
}
