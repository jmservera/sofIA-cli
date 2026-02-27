/**
 * Export command handler.
 *
 * Implements `sofia export` — exports workshop artifacts for a session.
 * Generates Markdown files per phase and a summary.json.
 */
import { createDefaultStore } from '../sessions/sessionStore.js';
import { exportSession } from '../sessions/exportWriter.js';
import { ensureExportDir } from '../sessions/exportPaths.js';

export interface ExportCommandOptions {
  session?: string;
  json?: boolean;
  debug?: boolean;
  logFile?: string;
  nonInteractive?: boolean;
  output?: string;
}

export async function exportCommand(opts: ExportCommandOptions): Promise<void> {
  if (!opts.session) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ error: 'No session specified. Use --session <id>.' }) + '\n');
    } else {
      console.error('Error: No session specified. Use --session <id>.');
    }
    process.exitCode = 1;
    return;
  }

  const store = createDefaultStore();

  if (!(await store.exists(opts.session))) {
    const msg = `Session "${opts.session}" not found.`;
    if (opts.json) {
      process.stdout.write(JSON.stringify({ error: msg }) + '\n');
    } else {
      console.error(`Error: ${msg}`);
    }
    process.exitCode = 1;
    return;
  }

  const session = await store.load(opts.session);
  const exportDir = opts.output
    ? opts.output
    : await ensureExportDir(opts.session);

  const result = await exportSession(session, exportDir);

  if (opts.json) {
    process.stdout.write(JSON.stringify({
      sessionId: session.sessionId,
      exported: true,
      exportDir: result.exportDir,
      files: result.files,
    }) + '\n');
  } else {
    console.log(`Exported session "${session.sessionId}" to ${result.exportDir}`);
    console.log(`Generated ${result.files.length} file(s):`);
    for (const file of result.files) {
      console.log(`  - ${file.path} (${file.type})`);
    }
  }
}
