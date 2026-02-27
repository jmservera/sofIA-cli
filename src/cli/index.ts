#!/usr/bin/env node
/**
 * sofIA CLI entrypoint.
 *
 * Provides the main `sofia` command with subcommands:
 * - workshop: start or resume a governed workshop session
 * - status: display session status
 * - export: export session artifacts
 */
import { Command } from 'commander';

const program = new Command();

program
  .name('sofia')
  .description('sofIA — AI Discovery Workshop CLI')
  .version('0.1.0');

// ── Global options ──────────────────────────────────────────────────────────

program
  .option('--session <id>', 'Target an existing session')
  .option('--json', 'Emit machine-readable JSON only on stdout')
  .option('--debug', 'Enable debug telemetry')
  .option('--log-file <path>', 'Write structured logs to file')
  .option('--non-interactive', 'Disallow prompts; fail with actionable error if input is missing');

// ── Workshop command ────────────────────────────────────────────────────────

program
  .command('workshop')
  .description('Start or resume a governed AI Discovery Workshop session')
  .option('--new-session', 'Start a new session')
  .option('--phase <phase>', 'Jump to a specific phase')
  .option('--retry <count>', 'Retry transient failures N times', parseInt)
  .action(async (opts) => {
    const { workshopCommand } = await import('./workshopCommand.js');
    const globalOpts = program.opts();
    const merged = { ...globalOpts, ...opts };

    // Direct command mode: if --session and --phase are both specified
    if (globalOpts.session && opts.phase) {
      const { runDirectCommand } = await import('./directCommands.js');
      const { createLoopIO } = await import('./ioContext.js');
      const { createDefaultStore } = await import('../sessions/sessionStore.js');
      const { createCopilotClient, createFakeCopilotClient } = await import('../shared/copilotClient.js');

      const store = createDefaultStore();
      const io = createLoopIO({ json: merged.json, nonInteractive: merged.nonInteractive });

      let client;
      try {
        client = await createCopilotClient();
      } catch {
        client = createFakeCopilotClient([
          { role: 'assistant', content: 'Direct command mode response.' },
        ]);
      }

      const result = await runDirectCommand({
        sessionId: globalOpts.session,
        phase: opts.phase,
        store,
        client,
        io,
        nonInteractive: merged.nonInteractive,
        json: merged.json,
        debug: merged.debug,
        retry: opts.retry,
      });

      process.exitCode = result.exitCode;
      return;
    }

    await workshopCommand(merged);
  });

// ── Status command ──────────────────────────────────────────────────────────

program
  .command('status')
  .description('Display session status and next expected action')
  .action(async () => {
    const { statusCommand } = await import('./statusCommand.js');
    const globalOpts = program.opts();
    await statusCommand(globalOpts);
  });

// ── Export command ──────────────────────────────────────────────────────────

program
  .command('export')
  .description('Export workshop artifacts for a session')
  .option('--output <dir>', 'Output directory (default: ./exports/<sessionId>/)')
  .action(async (opts) => {
    const { exportCommand } = await import('./exportCommand.js');
    const globalOpts = program.opts();
    await exportCommand({ ...globalOpts, ...opts });
  });

// ── Parse ───────────────────────────────────────────────────────────────────

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : 'Unknown error');
  process.exit(1);
});
