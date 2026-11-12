import { ROTULO_CANAL, type Loja, type Sugestao } from '@giro/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { dataHora } from '@/lib/formatar';
import { useEnviarSugestao } from './api';

/** Prévia da mensagem + ações de envio, conforme o canal da loja. */
export function Envio({ loja, sugestao }: { loja: Loja; sugestao: Sugestao }) {
  const enviar = useEnviarSugestao(sugestao.id);
  const [copia, setCopia] = useState<'sim' | 'falhou' | null>(null);
  const rascunho = sugestao.status === 'draft';
  const mensagem = sugestao.mensagem ?? '';

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem);
      setCopia('sim');
      setTimeout(() => setCopia(null), 2000);
    } catch {
      setCopia('falhou');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {sugestao.mensagem ? (
        <div
          className="rounded-md border bg-muted/40 p-3 text-sm leading-relaxed whitespace-pre-wrap"
          aria-label="Prévia da mensagem"
        >
          {sugestao.mensagem}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Esta sugestão não tem mensagem.</p>
      )}

      {!rascunho && sugestao.enviadaEm && (
        <p className="text-sm text-muted-foreground">
          Enviada em {dataHora(sugestao.enviadaEm)} ({ROTULO_CANAL[sugestao.canal]}).
        </p>
      )}

      {rascunho && loja.canal === 'telegram' && !loja.telegramVinculado && (
        <Alert>
          <AlertDescription>
            O dono ainda não vinculou o Telegram, então não dá para enviar por aqui.{' '}
            <Link to="/lojas" className="font-medium underline underline-offset-4">
              Gerar o link de vínculo em Lojas
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {rascunho && loja.canal === 'telegram' && loja.telegramVinculado && (
          <Button onClick={() => enviar.mutate()} disabled={enviar.isPending || !mensagem}>
            {enviar.isPending ? 'Enviando…' : 'Enviar pelo Telegram'}
          </Button>
        )}
        {loja.canal === 'manual' && mensagem && (
          <>
            <Button variant="outline" onClick={() => void copiar()}>
              {copia === 'sim' ? 'Copiado' : 'Copiar mensagem'}
            </Button>
            {loja.whatsapp && (
              <Button variant="outline" asChild>
                <a
                  href={`https://wa.me/${loja.whatsapp}?text=${encodeURIComponent(mensagem)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir WhatsApp
                </a>
              </Button>
            )}
          </>
        )}
        {rascunho && loja.canal === 'manual' && (
          <Button onClick={() => enviar.mutate()} disabled={enviar.isPending}>
            {enviar.isPending ? 'Salvando…' : 'Marcar como enviada'}
          </Button>
        )}
      </div>
      {copia === 'falhou' && (
        <p className="text-xs text-destructive">
          Não consegui copiar. Selecione o texto da prévia e copie.
        </p>
      )}
      {loja.canal === 'manual' && !loja.whatsapp && (
        <p className="text-xs text-muted-foreground">
          Sem WhatsApp cadastrado, o botão “Abrir WhatsApp” não aparece. Cadastre em Lojas.
        </p>
      )}
      {enviar.isError && (
        <Alert variant="destructive">
          <AlertDescription>{enviar.error.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
