import type { Loja } from '@giro/shared';
import { SelectNativo } from '@/components/select-nativo';

export function SeletorLoja({
  lojas,
  loja,
  escolher,
}: {
  lojas: Loja[];
  loja: Loja | undefined;
  escolher: (id: number) => void;
}) {
  if (lojas.length < 2) return null;
  return (
    <SelectNativo
      aria-label="Loja"
      className="max-w-xs"
      value={loja?.id ?? ''}
      onChange={(e) => escolher(Number(e.target.value))}
    >
      {lojas.map((l) => (
        <option key={l.id} value={l.id}>
          {l.nome}
        </option>
      ))}
    </SelectNativo>
  );
}
