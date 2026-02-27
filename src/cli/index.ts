#!/usr/bin/env node
import { Command } from 'commander';
import { runWorkshop } from './workshopCommand';

const program = new Command();

program
  .name('sofia')
  .description('sofIA Copilot CLI')
  .version('0.1.0');

program
  .command('workshop')
  .option('--session <id>', 'Session ID to resume')
  .option('--json', 'Emit JSON-only output')
.action(async (opts: { session?: string; json?: boolean }) => {
    const mode: 'new' | 'resume' = opts.session ? 'resume' : 'new';
    const result = await runWorkshop({ mode, inputs: { sessionId: opts.session } });
    if (opts.json) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(result));
    } else {
      // eslint-disable-next-line no-console
      console.log(`Session ${result.sessionId}: phases completed ${result.phasesCompleted.join(', ')}`);
    }
  });

program
  .command('status')
  .argument('<sessionId>', 'Session ID')
  .option('--json', 'Emit JSON-only output')
  .action(async (sessionId: string, opts: { json?: boolean }) => {
    const { runStatus } = await import('./statusCommand.js');
    const result = await runStatus(sessionId);
    if (!result) {
      // eslint-disable-next-line no-console
      console.error(`Session not found: ${sessionId}`);
      process.exitCode = 1;
      return;
    }
    if (opts.json) console.log(JSON.stringify(result));
    else console.log(`Session ${result.sessionId}: phase=${result.phase}, status=${result.status}`);
  });

program
  .command('export')
  .argument('<sessionId>', 'Session ID')
  .option('--base-dir <dir>', 'Export base directory')
  .action(async (sessionId: string, opts: { baseDir?: string }) => {
    const { runExport } = await import('./exportCommand.js');
    const result = await runExport(sessionId, { baseDir: opts.baseDir });
    // eslint-disable-next-line no-console
    console.log(`Exported session ${result.sessionId} to ${result.exportDir}`);
  });
