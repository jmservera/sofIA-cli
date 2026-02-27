#!/usr/bin/env node
/**
 * sofIA CLI entrypoint.
 *
 * Provides the main `sofia` command. Running `sofia` with no subcommand
 * starts the workshop flow (default). Explicit subcommands:
 * - workshop: alias for the default workshop flow
 * - status: display session status
 * - export: export session artifacts
 */
import { Command } from 'commander';

import type { PhaseValue } from '../shared/schemas/session.js';

// ── Handler types ──────────────────────────────────────────────────────────

export interface CliHandlers {
  workshopHandler: (opts: Record<string, unknown>) => Promise<void>;
  statusHandler: (opts: Record<string, unknown>) => Promise<void>;
  exportHandler: (opts: Record<string, unknown>) => Promise<void>;
}

// ── Build CLI ──────────────────────────────────────────────────────────────

/**
 * Build the Commander program. Accepts optional handler overrides for testing.
 * When handlers are not provided, they dynamically import the real modules.
 */
export function buildCli(handlers?: Partial<CliHandlers>): Command {
  const program = new Command();

  program
    .name('sofia')
    .description('sofIA — AI Discovery Workshop CLI')
    .version('0.1.0');

  // ── Global options ──────────────────────────────────────────────────────

  program
    .option('--session <id>', 'Target an existing session')
    .option('--json', 'Emit machine-readable JSON only on stdout')
    .option('--debug', 'Enable debug telemetry')
    .option('--log-file <path>', 'Write structured logs to file')
    .option('--non-interactive', 'Disallow prompts; fail with actionable error if input is missing');

  // ── Workshop options promoted to top level (FR-004) ──────────────────────

  program
    .option('--new-session', 'Start a new session')
    .option('--phase <phase>', 'Jump to a specific phase')
    .option('--retry <count>', 'Retry transient failures N times', parseInt);

  // ── Workshop handler logic ──────────────────────────────────────────────

  async function invokeWorkshopHandler(programOpts: Record<string, unknown>, cmdOpts?: Record<string, unknown>): Promise<void> {
    const merged = { ...programOpts, ...cmdOpts };

    if (handlers?.workshopHandler) {
      await handlers.workshopHandler(merged);
      return;
    }

    // Direct command mode: if --session and --phase are both specified
    if (merged.session && merged.phase) {
      const { runDirectCommand } = await import('./directCommands.js');
      const { createLoopIO } = await import('./ioContext.js');
      const { createDefaultStore } = await import('../sessions/sessionStore.js');
      const { createCopilotClient } = await import('../shared/copilotClient.js');
      const { getLogger } = await import('../logging/logger.js');

      const store = createDefaultStore();
      const io = createLoopIO({ json: merged.json as boolean, nonInteractive: merged.nonInteractive as boolean });

      let client;
      try {
        client = await createCopilotClient();
      } catch (err: unknown) {
        const logger = getLogger();
        logger.error({ err }, 'Failed to create Copilot client — cannot run direct command');
        const msg = err instanceof Error ? err.message : 'Unknown error creating Copilot client';
        if (merged.json) {
          process.stdout.write(JSON.stringify({ error: msg }) + '\n');
        } else {
          console.error(`Error: ${msg}`);
        }
        process.exitCode = 1;
        return;
      }

      const result = await runDirectCommand({
        sessionId: merged.session as string,
        phase: merged.phase as PhaseValue,
        store,
        client,
        io,
        nonInteractive: merged.nonInteractive as boolean,
        json: merged.json as boolean,
        debug: merged.debug as boolean,
        retry: merged.retry as number,
      });

      process.exitCode = result.exitCode;
      return;
    }

    const { workshopCommand } = await import('./workshopCommand.js');
    await workshopCommand(merged);
  }

  // ── Workshop command (default + alias) ─────────────────────────────────

  program
    .command('workshop', { isDefault: true })
    .description('Start or resume a governed AI Discovery Workshop session')
    .action(async () => {
      const opts = program.opts();
      await invokeWorkshopHandler(opts);
    });

  // ── Status command ────────────────────────────────────────────────────

  program
    .command('status')
    .description('Display session status and next expected action')
    .action(async () => {
      if (handlers?.statusHandler) {
        await handlers.statusHandler(program.opts());
        return;
      }
      const { statusCommand } = await import('./statusCommand.js');
      const globalOpts = program.opts();
      await statusCommand(globalOpts);
    });

  // ── Export command ────────────────────────────────────────────────────

  program
    .command('export')
    .description('Export workshop artifacts for a session')
    .option('--output <dir>', 'Output directory (default: ./exports/<sessionId>/)')
    .action(async (opts) => {
      if (handlers?.exportHandler) {
        await handlers.exportHandler({ ...program.opts(), ...opts });
        return;
      }
      const { exportCommand } = await import('./exportCommand.js');
      const globalOpts = program.opts();
      await exportCommand({ ...globalOpts, ...opts });
    });

  return program;
}

// ── Auto-parse when run as CLI entrypoint ─────────────────────────────────

// Only auto-parse when running as the main CLI entrypoint, not when imported for testing
const isMainModule = process.argv[1] &&
  (process.argv[1].endsWith('/cli/index.js') ||
   process.argv[1].endsWith('/cli/index.ts') ||
   process.argv[1].endsWith('sofia'));

if (isMainModule) {
  const program = buildCli();
  program.parseAsync(process.argv).catch((err) => {
    console.error(err instanceof Error ? err.message : 'Unknown error');
    process.exit(1);
  });
}
