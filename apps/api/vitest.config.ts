import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup-env.ts'],
    /** Integration — через bun test (Elysia требует Bun runtime). */
    exclude: ['**/node_modules/**', '**/*.integration.test.ts'],
  },
});
