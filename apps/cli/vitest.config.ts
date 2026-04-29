import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'cli',
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    testTimeout: 15000,
    pool: 'forks',
    poolOptions: {
      forks: { maxForks: 1, minForks: 1 },
    },
  },
});
