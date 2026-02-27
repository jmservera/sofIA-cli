import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.{test,spec}.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
    },
  },
});
