import {
  CANAIS,
  ROTULO_CANAL,
  edicaoLojaSchema,
  novaLojaSchema,
  type Canal,
  type Loja,
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
import { useCriarLoja, useEditarLoja } from './api';
import { Campo } from './campo';
import { errosPorCampo } from './util';

type Campos = {
  nome: string;
  nomeDono: string;
  whatsapp: string;
  canal: Canal;
  sistemaPdv: string;
  envioAutomatico: boolean;
};

const VAZIO: Campos = {
  nome: '',
  nomeDono: '',
  whatsapp: '',
  canal: 'manual',
  sistemaPdv: '',
  envioAutomatico: false,
};

const deLoja = (l: Loja): Campos => ({
  nome: l.nome,
  nomeDono: l.nomeDono,
  whatsapp: l.whatsapp ?? '',
  canal: l.canal,
  sistemaPdv: l.sistemaPdv ?? '',
  envioAutomatico: l.envioAutomatico,
});

/** Diálogo de loja nova (`loja` ausente) ou de edição. Montado só quando aberto, para o estado começar limpo. */
export function FormLoja({ loja, aoFechar }: { loja?: Loja; aoFechar: () => void }) {
  return (
    <Dialog open onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{loja ? 'Editar loja' : 'Nova loja'}</DialogTitle>
          <DialogDescription>
            {loja ? loja.nome : 'Cadastre a loja do dono e escolha como ele recebe a sugestão.'}
          </DialogDescription>
        </DialogHeader>
        {loja ? (
          <FormEdicao loja={loja} aoFechar={aoFechar} />
        ) : (
          <FormCriacao aoFechar={aoFechar} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FormCriacao({ aoFechar }: { aoFechar: () => void }) {
  const criar = useCriarLoja();
  const [campos, setCampos] = useState<Campos>(VAZIO);
  const [erros, setErros] = useState<Record<string, string>>({});

  function enviar(e: FormEvent) {
    e.preventDefault();
    const r = novaLojaSchema.safeParse({
      nome: campos.nome,
      nomeDono: campos.nomeDono,
      whatsapp: campos.whatsapp || null,
      canal: campos.canal,
      sistemaPdv: campos.sistemaPdv.trim() || null,
    });
    if (!r.success) return setErros(errosPorCampo(r.error));
    setErros({});
    criar.mutate(r.data, { onSuccess: aoFechar });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      <CamposLoja campos={campos} mudar={setCampos} erros={erros} />
      {criar.isError && (
        <Alert variant="destructive">
          <AlertDescription>{criar.error.message}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={aoFechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={criar.isPending}>
          {criar.isPending ? 'Salvando…' : 'Criar loja'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function FormEdicao({ loja, aoFechar }: { loja: Loja; aoFechar: () => void }) {
  const editar = useEditarLoja(loja.id);
  const [campos, setCampos] = useState<Campos>(deLoja(loja));
  const [erros, setErros] = useState<Record<string, string>>({});

  function enviar(e: FormEvent) {
    e.preventDefault();
    const r = edicaoLojaSchema.safeParse({
      nome: campos.nome,
      nomeDono: campos.nomeDono,
      whatsapp: campos.whatsapp || null,
      canal: campos.canal,
      sistemaPdv: campos.sistemaPdv.trim() || null,
      envioAutomatico: campos.envioAutomatico,
    });
    if (!r.success) return setErros(errosPorCampo(r.error));
    setErros({});
    editar.mutate(r.data, { onSuccess: aoFechar });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      <CamposLoja campos={campos} mudar={setCampos} erros={erros} />
      <div className="flex items-start justify-between gap-4 rounded-md border p-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="loja-envio-auto" className="text-sm font-medium">
            Envio automático
          </label>
          <p className="text-xs text-muted-foreground">
            Às 5h30 o Giro envia sozinho pelo Telegram. Deixe desligado na semana de baseline do
            piloto. Só funciona para loja com canal Telegram e chat vinculado.
          </p>
        </div>
        <Switch
          id="loja-envio-auto"
          checked={campos.envioAutomatico}
          onCheckedChange={(v) => setCampos({ ...campos, envioAutomatico: v })}
        />
      </div>
      {editar.isError && (
        <Alert variant="destructive">
          <AlertDescription>{editar.error.message}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={aoFechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={editar.isPending}>
          {editar.isPending ? 'Salvando…' : 'Salvar'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CamposLoja({
  campos,
  mudar,
  erros,
}: {
  campos: Campos;
  mudar: (c: Campos) => void;
  erros: Record<string, string>;
}) {
  return (
    <>
      <Campo id="loja-nome" rotulo="Nome da loja" erro={erros.nome}>
        {(p) => (
          <Input
            {...p}
            value={campos.nome}
            onChange={(e) => mudar({ ...campos, nome: e.target.value })}
          />
        )}
      </Campo>
      <Campo id="loja-dono" rotulo="Nome do dono" erro={erros.nomeDono}>
        {(p) => (
          <Input
            {...p}
            value={campos.nomeDono}
            onChange={(e) => mudar({ ...campos, nomeDono: e.target.value })}
          />
        )}
      </Campo>
      <Campo
        id="loja-whatsapp"
        rotulo="WhatsApp do dono"
        ajuda="Só números, com DDD. Exemplo: 16991234567"
        erro={erros.whatsapp}
      >
        {(p) => (
          <Input
            {...p}
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            value={campos.whatsapp}
            onChange={(e) => mudar({ ...campos, whatsapp: e.target.value.replace(/\D/g, '') })}
          />
        )}
      </Campo>
      <Campo id="loja-canal" rotulo="Como o dono recebe a sugestão" erro={erros.canal}>
        {(p) => (
          <SelectNativo
            {...p}
            value={campos.canal}
            onChange={(e) => mudar({ ...campos, canal: e.target.value as Canal })}
          >
            {CANAIS.map((c) => (
              <option key={c} value={c}>
                {ROTULO_CANAL[c]}
              </option>
            ))}
          </SelectNativo>
        )}
      </Campo>
      <Campo
        id="loja-pdv"
        rotulo="Sistema do PDV"
        ajuda="Opcional. Ex.: o programa que gera o arquivo de vendas."
        erro={erros.sistemaPdv}
      >
        {(p) => (
          <Input
            {...p}
            value={campos.sistemaPdv}
            onChange={(e) => mudar({ ...campos, sistemaPdv: e.target.value })}
          />
        )}
      </Campo>
    </>
  );
}
