import { ROTULO_CANAL, ROTULO_STATUS_SUGESTAO, type PainelHoje } from '@giro/shared';
import { Link } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { somarDias } from '@/features/lojas/util';
import { dataBr, dataHora } from '@/lib/formatar';
import { useGerarSugestao } from './api';
import { Envio } from './envio';
import { Respostas } from './respostas';

type Linha = PainelHoje['lojas'][number];

export function CardLoja({ linha, data }: { linha: Linha; data: string }) {
  const { loja, sugestao, importacoesPendentes, ultimoDiaComVendas } = linha;
  const gerar = useGerarSugestao(loja.id, data);
  const rascunho = sugestao?.status === 'draft';
  // vendas deveriam ter chegado até o dia anterior à data escolhida
  const semVendasRecentes = ultimoDiaComVendas === null || ultimoDiaComVendas < somarDias(data, -1);

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="break-words">{loja.nome}</CardTitle>
          {sugestao ? (
            <Badge variant={sugestao.status === 'draft' ? 'outline' : 'default'}>
              {ROTULO_STATUS_SUGESTAO[sugestao.status]}
            </Badge>
          ) : (
            <Badge variant="outline">sem sugestão</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {ROTULO_CANAL[loja.canal]} · dono: {loja.nomeDono}
          {sugestao?.enviadaEm && ` · enviada em ${dataHora(sugestao.enviadaEm)}`}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {(importacoesPendentes > 0 || semVendasRecentes) && (
          <div className="flex flex-col gap-2">
            {importacoesPendentes > 0 && (
              <Alert>
                <AlertDescription>
                  {importacoesPendentes === 1
                    ? '1 arquivo de vendas tem produtos sem mapear.'
                    : `${importacoesPendentes} arquivos de vendas têm produtos sem mapear.`}{' '}
                  <Link
                    to={`/importar?loja=${loja.id}`}
                    className="font-medium underline underline-offset-4"
                  >
                    Mapear agora
                  </Link>
                </AlertDescription>
              </Alert>
            )}
            {semVendasRecentes && (
              <Alert>
                <AlertDescription>
                  {ultimoDiaComVendas === null
                    ? 'Nenhum arquivo de vendas foi importado ainda.'
                    : `Sem arquivo de vendas desde ${dataBr(ultimoDiaComVendas)}.`}{' '}
                  <Link
                    to={`/importar?loja=${loja.id}`}
                    className="font-medium underline underline-offset-4"
                  >
                    Importar vendas
                  </Link>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {!sugestao && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted-foreground">
              Ainda não há sugestão para {dataBr(data)}.
            </p>
            <Button onClick={() => gerar.mutate(false)} disabled={gerar.isPending}>
              {gerar.isPending ? 'Gerando…' : 'Gerar sugestão'}
            </Button>
          </div>
        )}

        {sugestao && (
          <>
            <Envio loja={loja} sugestao={sugestao} />
            {rascunho && (
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => gerar.mutate(true)}
                  disabled={gerar.isPending}
                >
                  {gerar.isPending ? 'Gerando…' : 'Gerar de novo'}
                </Button>
                <p className="mt-1 text-xs text-muted-foreground">
                  Refaz o rascunho com os dados mais novos. Só vale antes de enviar.
                </p>
              </div>
            )}
            <Separator />
            <Respostas sugestao={sugestao} />
          </>
        )}

        {gerar.isError && (
          <Alert variant="destructive">
            <AlertDescription>{gerar.error.message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
