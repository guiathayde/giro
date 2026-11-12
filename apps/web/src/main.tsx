import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Layout } from '@/components/layout';
import { TokenGate } from '@/components/token-gate';
import { PaginaHoje } from '@/features/hoje/pagina-hoje';
import { PaginaImportacao } from '@/features/imports/pagina-importacao';
import { PaginaImportacoes } from '@/features/imports/pagina-importacoes';
import { PaginaInbox } from '@/features/inbox/pagina-inbox';
import { PaginaItens } from '@/features/itens/pagina-itens';
import { PaginaLojas } from '@/features/lojas/pagina-lojas';
import { PaginaMetricas } from '@/features/metricas/pagina-metricas';
import { PaginaPerdas } from '@/features/perdas/pagina-perdas';
import './index.css';

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <PaginaHoje /> },
      { path: '/importar', element: <PaginaImportacoes /> },
      { path: '/importar/:id', element: <PaginaImportacao /> },
      { path: '/itens', element: <PaginaItens /> },
      { path: '/perdas', element: <PaginaPerdas /> },
      { path: '/metricas', element: <PaginaMetricas /> },
      { path: '/lojas', element: <PaginaLojas /> },
      { path: '/inbox', element: <PaginaInbox /> },
    ],
  },
]);

const raiz = document.getElementById('root');
if (!raiz) throw new Error('elemento #root não encontrado');

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TokenGate>
        <RouterProvider router={router} />
      </TokenGate>
    </QueryClientProvider>
  </StrictMode>,
);
