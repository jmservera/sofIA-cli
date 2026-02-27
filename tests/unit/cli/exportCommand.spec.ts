import { describe, it, expect } from 'vitest';
import { runWorkshop } from '../../../src/cli/workshopCommand';
import { runExport } from '../../../src/cli/exportCommand';
import { existsSync, rmSync } from 'node:fs';

describe('export command', () => {
  it('exports artifacts to export dir', async () => {
    const { sessionId, artifacts } = await runWorkshop({ mode: 'new', inputs: {} });
    // ensure discover/ideate artifacts exist
    expect((artifacts as any).discover?.length ?? 0).toBeGreaterThan(0);
    const result = await runExport(sessionId, { baseDir: './tmp-exports' });
    expect(existsSync(`${result.exportDir}/summary.json`)).toBe(true);
    rmSync('./tmp-exports', { recursive: true, force: true });
  });
});
