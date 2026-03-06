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
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';

import { loadEnvFile } from './envLoader.js';
import type { PhaseValue } from '../shared/schemas/session.js';

// ── Load .env from workspace root ──────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.resolve(__dirname, '../../.env'));

// ── Read version from package.json (works from both src/ and dist/) ────────
let _pkgRoot = __dirname;
while (_pkgRoot !== path.dirname(_pkgRoot) && !existsSync(path.join(_pkgRoot, 'package.json'))) {
  _pkgRoot = path.dirname(_pkgRoot);
}
const { version } = JSON.parse(readFileSync(path.join(_pkgRoot, 'package.json'), 'utf-8')) as {
  version: string;
};

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

  program.name('sofia').description('sofIA — AI Discovery Workshop CLI').version(version);

  // ── Global options ──────────────────────────────────────────────────────

  program
    .option('--session <id>', 'Target an existing session')
    .option('--json', 'Emit machine-readable JSON only on stdout')
    .option('--debug', 'Enable debug telemetry')
    .option('--log-file <path>', 'Write structured logs to file')
    .option(
      '--non-interactive',
      'Disallow prompts; fail with actionable error if input is missing',
    );

  // ── Workshop options promoted to top level (FR-004) ──────────────────────

  program
    .option('--new-session', 'Start a new session')
    .option('--phase <phase>', 'Jump to a specific phase')
    .option('--retry <count>', 'Retry transient failures N times', parseInt);

  // ── Workshop handler logic ──────────────────────────────────────────────

  async function invokeWorkshopHandler(
    programOpts: Record<string, unknown>,
    cmdOpts?: Record<string, unknown>,
  ): Promise<void> {
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
      const io = createLoopIO({
        json: merged.json as boolean,
        nonInteractive: merged.nonInteractive as boolean,
      });

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

  // ── Infra command ─────────────────────────────────────────────────────

  // Lazy-register: the infra sub-command tree is built synchronously but
  // its actions use dynamic imports to keep cold-start fast.
  const infraCmd = new Command('infra')
    .description('Manage Azure AI Foundry infrastructure (deploy, gather-env, teardown)')
    .action(async () => {
      // When invoked without a sub-command, show help
      infraCmd.help();
    });

  // Sub-commands delegate to infraCommand.ts actions at runtime
  infraCmd
    .command('deploy')
    .description('Deploy Azure AI Foundry resources')
    .requiredOption('-g, --resource-group <name>', 'Resource group name (created if missing)')
    .option('-s, --subscription <id>', 'Azure subscription ID')
    .option('-l, --location <region>', 'Azure region (default: swedencentral)')
    .option('-n, --account-name <name>', 'Foundry account name (default: sofia-foundry)')
    .option('-m, --model <name>', 'Model deployment name (default: gpt-4.1-mini)')
    .action(async (opts) => {
      const { invokeInfraAction } = await import('./infraCommand.js');
      await invokeInfraAction('deploy.sh', opts, ['resourceGroup', 'subscription', 'location', 'accountName', 'model']);
    });

  infraCmd
    .command('gather-env')
    .description('Fetch environment values from an existing Azure deployment')
    .requiredOption('-g, --resource-group <name>', 'Resource group containing the Foundry resources')
    .option('-s, --subscription <id>', 'Azure subscription ID')
    .option('-n, --account-name <name>', 'AI Services account name (default: sofia-foundry)')
    .option('-m, --model <name>', 'Override model deployment name')
    .action(async (opts) => {
      const { invokeInfraAction } = await import('./infraCommand.js');
      await invokeInfraAction('gather-env.sh', opts, ['resourceGroup', 'subscription', 'accountName', 'model']);
    });

  infraCmd
    .command('teardown')
    .description('Remove Azure AI Foundry resources')
    .requiredOption('-g, --resource-group <name>', 'Resource group to delete')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (opts) => {
      const { invokeInfraAction } = await import('./infraCommand.js');
      await invokeInfraAction('teardown.sh', opts, ['resourceGroup', 'yes']);
    });

  program.addCommand(infraCmd);

  // ── Dev command ───────────────────────────────────────────────────────

  program
    .command('dev')
    .description('Generate a proof-of-concept repository for a completed workshop session')
    .option('--max-iterations <n>', 'Maximum Ralph loop iterations (default: 20)', parseInt)
    .option('--output <dir>', 'Output directory for the PoC (default: ./poc/<sessionId>/)')
    .option('--force', 'Overwrite existing output directory and start fresh')
    .action(async (opts) => {
      const { developCommand } = await import('./developCommand.js');
      const { createDefaultStore } = await import('../sessions/sessionStore.js');
      const { createLoopIO } = await import('./ioContext.js');
      const { createCopilotClient } = await import('../shared/copilotClient.js');
      const { getLogger } = await import('../logging/logger.js');
      const { loadMcpConfig, McpManager } = await import('../mcp/mcpManager.js');
      const { join: pathJoin } = await import('node:path');

      const globalOpts = program.opts();
      const merged = { ...globalOpts, ...opts };

      const store = createDefaultStore();
      const io = createLoopIO({
        json: merged.json as boolean,
        nonInteractive: merged.nonInteractive as boolean,
      });

      let client;
      try {
        client = await createCopilotClient();
      } catch (err: unknown) {
        const logger = getLogger();
        logger.error({ err }, 'Failed to create Copilot client');
        const msg = err instanceof Error ? err.message : 'Unknown error creating Copilot client';
        if (merged.json) {
          process.stdout.write(JSON.stringify({ error: msg }) + '\n');
        } else {
          process.stderr.write(`Error: ${msg}\n`);
        }
        process.exitCode = 1;
        return;
      }

      // Load MCP config and wire adapters when MCP servers are configured
      const mcpConfigPath = pathJoin(process.cwd(), '.vscode', 'mcp.json');
      let mcpManager: import('../mcp/mcpManager.js').McpManager | undefined;
      try {
        const mcpConfig = await loadMcpConfig(mcpConfigPath);
        if (Object.keys(mcpConfig.servers).length > 0) {
          mcpManager = new McpManager(mcpConfig);
          // Mark all configured servers as connected (optimistic: actual MCP failures
          // degrade gracefully inside GitHubMcpAdapter / McpContextEnricher)
          for (const name of mcpManager.listServers()) {
            mcpManager.markConnected(name);
          }
        }
      } catch {
        // MCP config is optional — proceed without it
      }

      await developCommand(merged as Parameters<typeof developCommand>[0], {
        store,
        io,
        client,
        mcpManager,
      });
    });

  return program;
}

// ── Auto-parse when run as CLI entrypoint ─────────────────────────────────

// Only auto-parse when running as the main CLI entrypoint, not when imported for testing
const isMainModule =
  process.argv[1] &&
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
