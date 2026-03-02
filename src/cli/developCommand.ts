/**
 * `sofia dev` command handler.
 *
 * Runs the Develop phase for a completed workshop session:
 * - Validates the session has selection + plan
 * - Derives checkpoint state for resume decisions
 * - Creates a RalphLoop and runs it
 * - Displays results (repo URL/path, final status)
 *
 * Contract: specs/002-poc-generation/tasks.md (T019, T029, T038)
 * Contract: specs/004-dev-resume-hardening/contracts/cli.md
 */
import { join } from 'node:path';
import { existsSync, rmSync } from 'node:fs';

import type { WorkshopSession } from '../shared/schemas/session.js';
import type { McpManager } from '../mcp/mcpManager.js';
import { createNoOpSpinner } from '../shared/activitySpinner.js';
import { RalphLoop } from '../develop/ralphLoop.js';
import { GitHubMcpAdapter } from '../develop/githubMcpAdapter.js';
import { McpContextEnricher } from '../develop/mcpContextEnricher.js';
import { deriveCheckpointState } from '../develop/checkpointState.js';
import { createDefaultRegistry, selectTemplate } from '../develop/templateRegistry.js';
import { PocScaffolder } from '../develop/pocScaffolder.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DevelopCommandOptions {
  /** Session ID to develop */
  session?: string;
  /** Maximum Ralph loop iterations */
  maxIterations?: number;
  /** Output directory for the PoC */
  output?: string;
  /** Force overwrite of existing output directory */
  force?: boolean;
  /** Emit machine-readable JSON only */
  json?: boolean;
  /** Enable debug output */
  debug?: boolean;
}

export interface DevelopCommandDeps {
  store: {
    load(sessionId: string): Promise<WorkshopSession | null>;
    save(session: WorkshopSession): Promise<void>;
    list(): Promise<string[]>;
  };
  io: import('../loop/conversationLoop.js').LoopIO;
  client: import('../shared/copilotClient.js').CopilotClient;
  /** Optional MCP manager — when provided, wires GitHub MCP and context enrichment */
  mcpManager?: McpManager;
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate that a session is ready for the Develop phase.
 *
 * Returns null if valid, or an error message if not.
 */
export function validateSessionForDevelop(session: WorkshopSession): string | null {
  if (!session.selection) {
    return [
      'Session is missing an idea selection.',
      'Run the Select phase first: sofia workshop --session ' + session.sessionId,
    ].join('\n');
  }

  if (!session.plan) {
    return [
      'Session is missing an implementation plan.',
      'Run the Plan phase first: sofia workshop --session ' + session.sessionId,
    ].join('\n');
  }

  return null;
}

// ── Command handler ───────────────────────────────────────────────────────────

/**
 * Main handler for the `sofia dev` command.
 */
export async function developCommand(
  opts: DevelopCommandOptions,
  deps: DevelopCommandDeps,
): Promise<void> {
  const { store, io, client } = deps;
  const { mcpManager } = deps;
  const json = opts.json ?? false;
  // ── Resolve session ──────────────────────────────────────────────────────
  let sessionId = opts.session;

  if (!sessionId) {
    // Try to find the most recent session
    const sessions = await store.list();
    if (sessions.length === 0) {
      const msg = 'No sessions found. Start a workshop first: sofia workshop';
      if (json) {
        process.stdout.write(JSON.stringify({ error: msg }) + '\n');
      } else {
        io.writeActivity(msg);
      }
      process.exitCode = 1;
      return;
    }
    sessionId = sessions[sessions.length - 1];
    io.writeActivity(`Using most recent session: ${sessionId}`);
  }

  // ── Load session ─────────────────────────────────────────────────────────
  const session = await store.load(sessionId);

  if (!session) {
    const msg = `Session not found: ${sessionId}`;
    if (json) {
      process.stdout.write(JSON.stringify({ error: msg }) + '\n');
    } else {
      io.writeActivity(msg);
    }
    process.exitCode = 1;
    return;
  }

  // ── Validate session ─────────────────────────────────────────────────────
  const validationError = validateSessionForDevelop(session);
  if (validationError) {
    if (json) {
      process.stdout.write(JSON.stringify({ error: validationError }) + '\n');
    } else {
      process.stderr.write(`Error: ${validationError}\n`);
    }
    process.exitCode = 1;
    return;
  }

  // ── Determine output directory ───────────────────────────────────────────
  const outputDir = opts.output
    ? join(process.cwd(), opts.output)
    : join(process.cwd(), 'poc', sessionId);

  // ── Handle --force: reset session.poc AND output directory ───────────────
  if (opts.force) {
    // FR-008/009/010: Clear session state before doing anything else
    session.poc = undefined;
    await store.save(session);

    const dirExists = existsSync(outputDir);
    if (dirExists) {
      try {
        rmSync(outputDir, { recursive: true, force: true });
      } catch (err: unknown) {
        const msg = `Failed to clear output directory: ${err instanceof Error ? err.message : String(err)}`;
        if (json) {
          process.stdout.write(JSON.stringify({ error: msg }) + '\n');
        } else {
          process.stderr.write(`Error: ${msg}\n`);
        }
        process.exitCode = 1;
        return;
      }
    }
    if (!json) {
      io.writeActivity('Cleared existing output directory and session state (--force)');
    }
  }

  // ── Derive checkpoint state (resume detection) ───────────────────────────
  const checkpoint = deriveCheckpointState(session, outputDir);

  // FR-005: If PoC already succeeded, exit with completion message
  if (!opts.force && checkpoint.priorFinalStatus === 'success') {
    const msg = `PoC already complete for session ${sessionId}. Use --force to start fresh.`;
    if (json) {
      process.stdout.write(JSON.stringify({ status: 'already-complete', sessionId }) + '\n');
    } else {
      io.writeActivity(msg);
    }
    return;
  }

  // FR-006: Default to resume for failed/partial
  if (!opts.force && checkpoint.hasPriorRun) {
    if (!json) {
      io.writeActivity(
        `Resuming session ${sessionId} from iteration ${checkpoint.resumeFromIteration} (${checkpoint.completedIterations} completed iterations found)`,
      );
    }
  }

  // ── Template selection ────────────────────────────────────────────────────
  const registry = createDefaultRegistry();
  const template = selectTemplate(
    registry,
    session.plan?.architectureNotes,
    session.plan?.dependencies,
  );
  if (!json) {
    const matchedPattern = template.matchPatterns.find((p) =>
      [session.plan?.architectureNotes ?? '', ...(session.plan?.dependencies ?? [])]
        .join(' ')
        .toLowerCase()
        .includes(p.toLowerCase()),
    );
    io.writeActivity(
      `Selected template: ${template.id}${matchedPattern ? ` (matched '${matchedPattern}' in architecture notes)` : ' (default)'}`,
    );
  }

  // ── Create RalphLoop ─────────────────────────────────────────────────────
  const spinner = createNoOpSpinner();

  const enricher = mcpManager ? new McpContextEnricher(mcpManager) : undefined;
  const githubAdapter = mcpManager ? new GitHubMcpAdapter(mcpManager) : undefined;

  const ralph = new RalphLoop({
    client,
    io,
    session,
    spinner,
    maxIterations: opts.maxIterations ?? 10,
    outputDir,
    enricher,
    githubAdapter,
    checkpoint,
    scaffolder: new PocScaffolder(template),
    templateEntry: template,
    onSessionUpdate: async (updated) => {
      await store.save(updated);
    },
    onEvent: (event) => {
      if (opts.debug) {
        io.writeActivity(`[event] ${event.type}: ${JSON.stringify(event)}`);
      }
    },
  });

  // ── Run the loop ─────────────────────────────────────────────────────────
  if (!json) {
    io.writeActivity(
      `Starting PoC generation for session: ${sessionId}\n` +
        `Output: ${outputDir}\n` +
        `Max iterations: ${opts.maxIterations ?? 10}`,
    );
  }

  let result;
  try {
    result = await ralph.run();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (json) {
      process.stdout.write(JSON.stringify({ error: msg }) + '\n');
    } else {
      process.stderr.write(`Error: ${msg}\n`);
    }
    process.exitCode = 1;
    return;
  }

  // ── Display results ──────────────────────────────────────────────────────
  if (json) {
    const output = {
      sessionId,
      finalStatus: result.finalStatus,
      terminationReason: result.terminationReason,
      iterationsCompleted: result.iterationsCompleted,
      repoSource: result.session.poc?.repoSource ?? 'local',
      repoUrl: result.session.poc?.repoUrl,
      repoPath: result.session.poc?.repoPath ?? outputDir,
      outputDir: result.outputDir,
    };
    process.stdout.write(JSON.stringify(output) + '\n');
  } else {
    const repoInfo = result.session.poc?.repoUrl
      ? `Repository URL: ${result.session.poc.repoUrl}`
      : `Repository Path: ${result.session.poc?.repoPath ?? outputDir}`;

    io.write(
      [
        '',
        `PoC Generation Complete`,
        `──────────────────────`,
        `Status: ${result.finalStatus}`,
        `Reason: ${result.terminationReason}`,
        `Iterations: ${result.iterationsCompleted}`,
        repoInfo,
        '',
      ].join('\n'),
    );

    if (result.finalStatus !== 'success') {
      io.write(
        [
          'Recovery options:',
          `  • Resume: sofia dev --session ${sessionId}`,
          `  • More iterations: sofia dev --session ${sessionId} --max-iterations 20`,
          `  • Start fresh: sofia dev --session ${sessionId} --force`,
          '',
        ].join('\n'),
      );
    }
  }

  // Exit code based on final status
  if (result.finalStatus === 'failed') {
    process.exitCode = 1;
  }
}
