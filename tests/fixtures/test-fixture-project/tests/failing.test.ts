import { describe, it, expect } from 'vitest';

describe('failing', () => {
  it('fails intentionally', () => {
    expect(1).toBe(2);
  });
});
