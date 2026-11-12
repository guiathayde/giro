import type { Importacao } from '@giro/shared';
import { Badge } from '@/components/ui/badge';

export function StatusImportacao({ importacao }: { importacao: Importacao }) {
  if (importacao.status === 'error') return <Badge variant="destructive">Erro</Badge>;
  if (importacao.status === 'pending') return <Badge variant="secondary">Processando</Badge>;
  if (importacao.linhasNaoMapeadas > 0) return <Badge variant="outline">Mapear</Badge>;
  return <Badge>Ok</Badge>;
}
