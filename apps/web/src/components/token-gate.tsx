import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EVENTO_NAO_AUTORIZADO, salvarToken } from '@/lib/api';

/** Quando a API pede autenticação (API_TOKEN), pede o token uma vez e guarda no navegador. */
export function TokenGate({ children }: { children: ReactNode }) {
  const [pedindo, setPedindo] = useState(false);
  const [token, setToken] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    const aoNegar = () => setPedindo(true);
    window.addEventListener(EVENTO_NAO_AUTORIZADO, aoNegar);
    return () => window.removeEventListener(EVENTO_NAO_AUTORIZADO, aoNegar);
  }, []);

  function entrar(e: FormEvent) {
    e.preventDefault();
    salvarToken(token.trim());
    setPedindo(false);
    void queryClient.invalidateQueries();
  }

  if (!pedindo) return children;
  return (
    <div className="flex min-h-svh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Token de acesso</CardTitle>
          <CardDescription>
            A API do Giro pede um token. Ele fica salvo neste navegador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={entrar} className="flex flex-col gap-3">
            <Label htmlFor="token">Token</Label>
            <Input
              id="token"
              type="password"
              autoComplete="current-password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <Button type="submit" disabled={!token.trim()}>
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
