import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

interface ExportWriterOptions {
  baseDir?: string;
}

export class ExportWriter {
  private baseDir: string;
  constructor(opts: ExportWriterOptions = {}) {
    this.baseDir = opts.baseDir ?? join(process.cwd(), 'exports');
  }

  async exportSession(session: { sessionId: string; artifacts: any }): Promise<void> {
    const targetDir = join(this.baseDir, session.sessionId);
    await fs.mkdir(targetDir, { recursive: true });
    const files: { path: string; type: string }[] = [];
    const artifacts = session.artifacts ?? {};
    const phases = ['discover', 'ideate', 'design', 'select', 'plan'];
    for (const phase of phases) {
      const content = artifacts[phase];
      if (!content) continue;
      const filePath = join(targetDir, `${phase}.md`);
      const text = Array.isArray(content) ? content.join('\n') : String(content);
      await fs.writeFile(filePath, text, 'utf8');
      files.push({ path: filePath, type: 'markdown' });
    }
    // summary.json
    const summaryPath = join(targetDir, 'summary.json');
    const summary = { sessionId: session.sessionId, files };
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  }
}
