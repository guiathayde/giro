/** página provisória até a tela ser implementada */
export function EmConstrucao({ titulo }: { titulo: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
      <p className="text-muted-foreground">Em construção.</p>
    </div>
  );
}
