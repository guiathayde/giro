import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // integração roda à parte (pnpm test:int), com Postgres
    exclude: ['test/integracao/**', '**/node_modules/**'],
  },
});
