import { describe, it, expect } from 'vitest';
import { runWorkshop } from '../../src/cli/workshopCommand';
import { ExportWriter } from '../../src/sessions/exportWriter';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Export artifacts (integration)', () => {
  it('writes Markdown artifacts and summary.json to exports/<sessionId>/', async () => {
    const result = await runWorkshop({ mode: 'new', inputs: { sessionName: 'ExportTest' } });
    const sessionId = result.sessionId;
    const tempExport = mkdtempSync(join(tmpdir(), 'sofia-export-'));
    const writer = new ExportWriter({ baseDir: tempExport });
    await writer.exportSession({ sessionId, artifacts: result.artifacts } as any);
    const summaryPath = join(tempExport, sessionId, 'summary.json');
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
    expect(summary.sessionId).toBe(sessionId);
    expect(summary.files.length).toBeGreaterThan(0);
    rmSync(tempExport, { recursive: true, force: true });
  });
});
