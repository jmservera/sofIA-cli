import { describe, it, expect } from 'vitest';
import { createLogger } from '../../src/logging/logger';

const sensitive = {
  token: 'secret-token-123',
  password: 'super-secret',
  nested: { apiKey: 'abc123' },
};

describe('logger', () => {
  it('redacts sensitive fields from logs', async () => {
    let captured = '';
    const destination = new (require('stream').Writable)({
      write(chunk: any, _enc: any, cb: any) {
        captured += chunk.toString();
        cb();
      },
    });
    const logger = createLogger({ level: 'debug', destination });

    logger.info({ context: sensitive }, 'test message');
    expect(captured).toBeDefined();
    expect(captured).not.toContain('secret-token-123');
    expect(captured).not.toContain('super-secret');
    expect(captured).not.toContain('abc123');
    expect(captured).toMatch(/\[REDACTED\]/);
  });
});
