import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.{test,spec}.ts'],
    exclude: ['tests/live/**'],
    coverage: {
      enabled: true,
      provider: 'v8',
    },
  },
});
