import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Layout } from '@/components/layout';
import { PaginaImportacao } from '@/features/imports/pagina-importacao';
import { PaginaImportacoes } from '@/features/imports/pagina-importacoes';
import { Inicio } from '@/routes/inicio';
import './index.css';

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Inicio /> },
      { path: '/importar', element: <PaginaImportacoes /> },
      { path: '/importar/:id', element: <PaginaImportacao /> },
    ],
  },
]);

const raiz = document.getElementById('root');
if (!raiz) throw new Error('elemento #root não encontrado');

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
