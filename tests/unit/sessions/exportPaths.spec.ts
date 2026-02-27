/**
 * Unit tests for export path helpers.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { getExportDir, ensureExportDir } from '../../../src/sessions/exportPaths.js';

describe('exportPaths', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sofia-export-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('getExportDir returns correct path', () => {
    const dir = getExportDir('sess-42', tmpDir);
    expect(dir).toBe(join(tmpDir, 'sess-42'));
  });

  it('ensureExportDir creates the directory', async () => {
    const dir = await ensureExportDir('sess-42', tmpDir);
    const stats = await stat(dir);
    expect(stats.isDirectory()).toBe(true);
  });

  it('ensureExportDir is idempotent', async () => {
    await ensureExportDir('sess-42', tmpDir);
    const dir = await ensureExportDir('sess-42', tmpDir);
    expect(dir).toBe(join(tmpDir, 'sess-42'));
  });
});
