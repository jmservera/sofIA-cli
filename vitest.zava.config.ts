/**
 * Vitest config for live (slow) tests that hit the real Copilot SDK.
 * Run with: npm run test:live
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['tests/setup/loadEnv.ts'],
    include: ['tests/live/zavaFullWorkshop.spec.ts'],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    coverage: {
      enabled: true,
      provider: 'v8',
    },
  },
});
