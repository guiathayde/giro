import { defineConfig } from 'vitest/config';

// Testes de integração com Postgres de verdade: pnpm test:int (precisa do postgres no ar).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integracao/**/*.int.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
