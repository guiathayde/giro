import {
  ROTULO_UNIDADE,
  UNIDADES,
  edicaoItemSchema,
  novoItemSchema,
  type Item,
  type Unidade,
} from '@giro/shared';
import { useState, type FormEvent } from 'react';
import { SelectNativo } from '@/components/select-nativo';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Campo } from '@/features/lojas/campo';
import { errosPorCampo, lerNumero, numeroParaCampo } from '@/features/lojas/util';
import { ErroApi } from '@/lib/api';
import { useCriarItem, useEditarItem } from './api';

type Campos = {
  nome: string;
  unidade: Unidade;
  vidaUtilDias: string;
  custoMedio: string;
  precoMedio: string;
  multiploPedido: string;
  ativo: boolean;
  aliases: string;
};

const VAZIO: Campos = {
  nome: '',
  unidade: 'kg',
  vidaUtilDias: '7',
  custoMedio: '',
  precoMedio: '',
  multiploPedido: '',
  ativo: true,
  aliases: '',
};

const deItem = (i: Item): Campos => ({
  nome: i.nome,
  unidade: i.unidade,
  vidaUtilDias: String(i.vidaUtilDias),
  custoMedio: numeroParaCampo(i.custoMedio),
  precoMedio: numeroParaCampo(i.precoMedio),
  multiploPedido: numeroParaCampo(i.multiploPedido),
  ativo: i.ativo,
  aliases: i.aliases.join('\n'),
});

type Dados = {
  nome: string;
  unidade: Unidade;
  vidaUtilDias: number;
  custoMedio: number | null;
  precoMedio: number | null;
  multiploPedido: number | null;
  ativo: boolean;
  aliases: string[];
};

/** Converte os textos do formulário; erros em português por campo. */
function converter(c: Campos): { dados: Dados; erros: Record<string, string> } {
  const erros: Record<string, string> = {};
  const numeroOpcional = (campo: keyof Campos, texto: string, positivo: boolean) => {
    const n = lerNumero(texto);
    if (n === null) return null;
    if (Number.isNaN(n)) erros[campo] = 'Digite um número, ex.: 12,50';
    else if (positivo ? n <= 0 : n < 0)
      erros[campo] = positivo ? 'Use um número maior que zero' : 'Não pode ser negativo';
    return n;
  };

  const vida = lerNumero(c.vidaUtilDias);
  if (vida === null || Number.isNaN(vida) || !Number.isInteger(vida) || vida < 1 || vida > 60)
    erros.vidaUtilDias = 'Use um número inteiro de dias, de 1 a 60';

  const aliases = [
    ...new Set(
      c.aliases
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    ),
  ];
  return {
    erros,
    dados: {
      nome: c.nome,
      unidade: c.unidade,
      vidaUtilDias: vida ?? Number.NaN,
      custoMedio: numeroOpcional('custoMedio', c.custoMedio, false),
      precoMedio: numeroOpcional('precoMedio', c.precoMedio, false),
      multiploPedido: numeroOpcional('multiploPedido', c.multiploPedido, true),
      ativo: c.ativo,
      aliases,
    },
  };
}

/** Diálogo de item novo (`item` ausente) ou de edição. Montado só quando aberto. */
export function FormItem({
  lojaId,
  item,
  aoFechar,
}: {
  lojaId: number;
  item?: Item;
  aoFechar: () => void;
}) {
  const criar = useCriarItem(lojaId);
  const editar = useEditarItem(item?.id ?? 0, lojaId);
  const mutacao = item ? editar : criar;
  const [campos, setCampos] = useState<Campos>(item ? deItem(item) : VAZIO);
  const [erros, setErros] = useState<Record<string, string>>({});

  function enviar(e: FormEvent) {
    e.preventDefault();
    const { dados, erros: errosNumeros } = converter(campos);
    const r = item ? edicaoItemSchema.safeParse(dados) : novoItemSchema.safeParse(dados);
    const todos = { ...(r.success ? {} : errosPorCampo(r.error)), ...errosNumeros };
    if (Object.keys(todos).length > 0 || !r.success) return setErros(todos);
    setErros({});
    if (item) editar.mutate(r.data, { onSuccess: aoFechar });
    else criar.mutate(r.data as Parameters<typeof criar.mutate>[0], { onSuccess: aoFechar });
  }

  // 409 = nome repetido: mostra junto do campo, não como alerta solto
  const nomeRepetido = mutacao.error instanceof ErroApi && mutacao.error.status === 409;
  const erroNome =
    erros.nome ?? (nomeRepetido ? 'Já existe um item com esse nome nesta loja.' : undefined);
  const erroGeral = mutacao.isError && !nomeRepetido ? mutacao.error.message : null;
  const mudar = (parcial: Partial<Campos>) => {
    setCampos({ ...campos, ...parcial });
    if (mutacao.isError) mutacao.reset();
  };

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? 'Editar item' : 'Novo item'}</DialogTitle>
          <DialogDescription>
            {item ? item.nome : 'Produto que a loja vende e que o Giro pode sugerir.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <Campo id="item-nome" rotulo="Nome" erro={erroNome}>
            {(p) => (
              <Input {...p} value={campos.nome} onChange={(e) => mudar({ nome: e.target.value })} />
            )}
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo id="item-unidade" rotulo="Unidade" erro={erros.unidade}>
              {(p) => (
                <SelectNativo
                  {...p}
                  value={campos.unidade}
                  onChange={(e) => mudar({ unidade: e.target.value as Unidade })}
                >
                  {UNIDADES.map((u) => (
                    <option key={u} value={u}>
                      {ROTULO_UNIDADE[u]}
                    </option>
                  ))}
                </SelectNativo>
              )}
            </Campo>
            <Campo id="item-vida" rotulo="Vida útil (dias)" erro={erros.vidaUtilDias}>
              {(p) => (
                <Input
                  {...p}
                  inputMode="numeric"
                  value={campos.vidaUtilDias}
                  onChange={(e) => mudar({ vidaUtilDias: e.target.value })}
                />
              )}
            </Campo>
            <Campo id="item-custo" rotulo="Custo médio (R$)" erro={erros.custoMedio}>
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  placeholder="0,00"
                  value={campos.custoMedio}
                  onChange={(e) => mudar({ custoMedio: e.target.value })}
                />
              )}
            </Campo>
            <Campo id="item-preco" rotulo="Preço médio (R$)" erro={erros.precoMedio}>
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  placeholder="0,00"
                  value={campos.precoMedio}
                  onChange={(e) => mudar({ precoMedio: e.target.value })}
                />
              )}
            </Campo>
          </div>
          <Campo
            id="item-multiplo"
            rotulo="Múltiplo do pedido"
            ajuda="Vazio = padrão: un 5, demais 1"
            erro={erros.multiploPedido}
          >
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={campos.multiploPedido}
                onChange={(e) => mudar({ multiploPedido: e.target.value })}
              />
            )}
          </Campo>
          <Campo
            id="item-apelidos"
            rotulo="Apelidos no PDV"
            ajuda="Um por linha. São os nomes que o sistema da loja usa para este produto."
            erro={erros.aliases}
          >
            {(p) => (
              <Textarea
                {...p}
                rows={4}
                value={campos.aliases}
                onChange={(e) => mudar({ aliases: e.target.value })}
              />
            )}
          </Campo>
          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <label htmlFor="item-ativo" className="text-sm font-medium">
              Ativo
              <span className="block text-xs font-normal text-muted-foreground">
                Itens inativos não entram nas sugestões.
              </span>
            </label>
            <Switch
              id="item-ativo"
              checked={campos.ativo}
              onCheckedChange={(v) => mudar({ ativo: v })}
            />
          </div>
          {erroGeral && (
            <Alert variant="destructive">
              <AlertDescription>{erroGeral}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutacao.isPending}>
              {mutacao.isPending ? 'Salvando…' : item ? 'Salvar' : 'Criar item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
