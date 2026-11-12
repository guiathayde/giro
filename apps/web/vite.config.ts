import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // mesmo contrato do nginx no docker: /api/* → API sem o prefixo
    proxy: {
      '/api': {
        target: process.env.API_URL ?? 'http://localhost:3333',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
