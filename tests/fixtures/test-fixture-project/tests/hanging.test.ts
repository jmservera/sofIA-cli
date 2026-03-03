import { describe, it } from 'vitest';

describe('hanging', () => {
  it('hangs indefinitely', async () => {
    await new Promise(() => {
      // This promise never resolves — simulates a hanging test
    });
  });
});
