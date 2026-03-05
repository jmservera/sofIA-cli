import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['tests/setup/loadEnv.ts'],
    include: ['tests/**/*.{test,spec}.ts'],
    exclude: ['tests/live/**', 'tests/fixtures/**'],
    coverage: {
      enabled: true,
      provider: 'v8',
    },
    testTimeout: 10_000, // Default timeout for tests (can be overridden per test)
  },
});
