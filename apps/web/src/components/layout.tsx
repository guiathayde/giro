import { NavLink, Outlet } from 'react-router';
import { cn } from '@/lib/utils';

const LINKS = [
  { para: '/', rotulo: 'Início' },
  { para: '/importar', rotulo: 'Importar vendas' },
];

export function Layout() {
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
          <span className="text-lg font-semibold tracking-tight">Giro</span>
          <nav className="flex gap-4 text-sm">
            {LINKS.map((l) => (
              <NavLink
                key={l.para}
                to={l.para}
                end={l.para === '/'}
                className={({ isActive }) =>
                  cn(
                    'text-muted-foreground hover:text-foreground',
                    isActive && 'text-foreground font-medium',
                  )
                }
              >
                {l.rotulo}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
