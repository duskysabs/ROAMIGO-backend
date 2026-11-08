import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/integration/*.postgres.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
