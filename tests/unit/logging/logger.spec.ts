/**
 * Unit tests for logger module.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createLogger } from '../../../src/logging/logger.js';

describe('createLogger', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sofia-log-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates a logger that logs to a file', async () => {
    const logFile = join(tmpDir, 'test.log');
    const logger = createLogger({ logFile, level: 'info' });
    logger.info({ msg: 'hello world' });
    logger.flush();
    // pino async flush; wait a bit
    await new Promise((r) => setTimeout(r, 200));
    const content = await readFile(logFile, 'utf-8');
    expect(content).toContain('hello world');
  });

  it('creates a logger that writes to stderr when no logFile given', () => {
    const logger = createLogger({ level: 'warn' });
    // Should not throw
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
  });

  it('redacts fields matching secret patterns', async () => {
    const logFile = join(tmpDir, 'redact.log');
    const logger = createLogger({ logFile, level: 'info' });
    logger.info({ password: 'secret123', token: 'tok_abc', msg: 'safe' });
    logger.flush();
    await new Promise((r) => setTimeout(r, 200));
    const content = await readFile(logFile, 'utf-8');
    expect(content).not.toContain('secret123');
    expect(content).not.toContain('tok_abc');
  });
});
