import type { Item } from '@giro/shared';
import { useId, useState, type ReactNode } from 'react';
import { SelectNativo } from '@/components/select-nativo';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

/** Rótulo + controle + mensagem de erro do campo. */
export function Campo({
  rotulo,
  erro,
  children,
  className,
}: {
  rotulo: string;
  erro?: string | undefined;
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby'?: string;
  }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const idErro = `${id}-erro`;
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <Label htmlFor={id}>{rotulo}</Label>
      {children({
        id,
        'aria-invalid': Boolean(erro),
        ...(erro ? { 'aria-describedby': idErro } : {}),
      })}
      {erro && (
        <p id={idErro} className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}

/** <select> nativo com os itens ativos primeiro e os inativos num grupo à parte. */
export function SelecaoItem({
  itens,
  valor,
  aoMudar,
  props,
}: {
  itens: Item[];
  valor: string;
  aoMudar: (v: string) => void;
  props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string };
}) {
  const ativos = itens.filter((i) => i.ativo);
  const inativos = itens.filter((i) => !i.ativo);
  return (
    <SelectNativo value={valor} onChange={(e) => aoMudar(e.target.value)} {...props}>
      <option value="">Escolha o item…</option>
      <optgroup label="Itens ativos">
        {ativos.map((i) => (
          <option key={i.id} value={i.id}>
            {i.nome}
          </option>
        ))}
      </optgroup>
      {inativos.length > 0 && (
        <optgroup label="Itens inativos">
          {inativos.map((i) => (
            <option key={i.id} value={i.id}>
              {i.nome}
            </option>
          ))}
        </optgroup>
      )}
    </SelectNativo>
  );
}

/** Excluir com confirmação no próprio lugar (sem janela, melhor no celular). */
export function BotaoExcluir({
  descricao,
  aoConfirmar,
  desabilitado,
}: {
  descricao: string;
  aoConfirmar: () => void;
  desabilitado?: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);
  if (!confirmando)
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Excluir ${descricao}`}
        disabled={desabilitado}
        onClick={() => setConfirmando(true)}
      >
        Excluir
      </Button>
    );
  return (
    <span
      className="inline-flex gap-1"
      role="group"
      aria-label={`Confirmar exclusão de ${descricao}`}
    >
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={desabilitado}
        onClick={() => {
          aoConfirmar();
          setConfirmando(false);
        }}
      >
        Confirmar
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setConfirmando(false)}>
        Não
      </Button>
    </span>
  );
}
