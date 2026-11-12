import { NavLink, Outlet } from 'react-router';
import { StatusSistema } from '@/components/status-sistema';
import { cn } from '@/lib/utils';

const LINKS = [
  { para: '/', rotulo: 'Hoje' },
  { para: '/importar', rotulo: 'Importar vendas' },
  { para: '/itens', rotulo: 'Itens' },
  { para: '/perdas', rotulo: 'Perdas e faltas' },
  { para: '/metricas', rotulo: 'Métricas' },
  { para: '/lojas', rotulo: 'Lojas' },
  { para: '/inbox', rotulo: 'Inbox' },
];

export function Layout() {
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <span className="text-lg font-semibold tracking-tight">Giro</span>
          {/* no celular a navegação rola para o lado */}
          <nav className="-mx-1 flex min-w-0 flex-1 gap-4 overflow-x-auto px-1 text-sm whitespace-nowrap">
            {LINKS.map((l) => (
              <NavLink
                key={l.para}
                to={l.para}
                end={l.para === '/'}
                className={({ isActive }) =>
                  cn(
                    'text-muted-foreground hover:text-foreground',
                    isActive && 'font-medium text-foreground',
                  )
                }
              >
                {l.rotulo}
              </NavLink>
            ))}
          </nav>
          <StatusSistema />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
