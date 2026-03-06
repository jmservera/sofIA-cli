/**
 * Workshop command handler.
 *
 * Implements `sofia workshop` — the main interactive workshop command
 * with New Session, Resume Session, Status, and Export menu options.
 * Drives phase-by-phase conversation with decision gates.
 */
import { join } from 'node:path';

import { ConversationLoop } from '../loop/conversationLoop.js';
import { createCopilotClient } from '../shared/copilotClient.js';
import type { CopilotClient } from '../shared/copilotClient.js';
import { ActivitySpinner } from '../shared/activitySpinner.js';
import { getLogger } from '../logging/logger.js';
import type { WorkshopSession, PhaseValue } from '../shared/schemas/session.js';
import { SessionStore, createDefaultStore } from '../sessions/sessionStore.js';
import { createLoopIO } from './ioContext.js';
import { createPhaseHandler, getPhaseOrder, getNextPhase } from '../phases/phaseHandlers.js';
import type { PhaseHandlerConfig } from '../phases/phaseHandlers.js';
import type { SofiaEvent } from '../shared/events.js';
import { renderMarkdown } from '../shared/markdownRenderer.js';
import {
  destroyWebSearchSession,
  isWebSearchConfigured,
  createWebSearchTool,
} from '../mcp/webSearch.js';
import type { WebSearchConfig } from '../mcp/webSearch.js';
import { loadEnvFile } from './envLoader.js';
import { loadMcpConfig, McpManager } from '../mcp/mcpManager.js';
import { RalphLoop } from '../develop/ralphLoop.js';
import { McpContextEnricher } from '../develop/mcpContextEnricher.js';
import { deriveCheckpointState } from '../develop/checkpointState.js';
import { createDefaultRegistry, selectTemplate } from '../develop/templateRegistry.js';

export interface WorkshopCommandOptions {
  session?: string;
  json?: boolean;
  debug?: boolean;
  logFile?: string;
  nonInteractive?: boolean;
  newSession?: boolean;
  phase?: string;
  retry?: number;
}

/**
 * Generate a timestamp-based session ID for human-friendly filenames.
 * Format: YYYY-MM-DD_HHmmss  (e.g. "2026-02-27_143052")
 */
function generateSessionId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return [
    d.getFullYear(),
    '-',
    pad(d.getMonth() + 1),
    '-',
    pad(d.getDate()),
    '_',
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds()),
  ].join('');
}

/**
 * Format a session identifier for display.
 * Shows "name (id)" when a name exists, otherwise just the id.
 */
function sessionDisplayName(session: { sessionId: string; name?: string }): string {
  return session.name ? `${session.name} (${session.sessionId})` : session.sessionId;
}

/**
 * Create a new empty workshop session.
 */
function createNewSession(): WorkshopSession {
  const now = new Date().toISOString();
  return {
    sessionId: generateSessionId(),
    schemaVersion: '1.0.0',
    createdAt: now,
    updatedAt: now,
    phase: 'Discover',
    status: 'Active',
    participants: [],
    artifacts: { generatedFiles: [] },
    turns: [],
  };
}

/**
 * Show the main workshop menu and return user choice.
 */
async function showMainMenu(
  io: ReturnType<typeof createLoopIO>,
  existingSessions: string[],
): Promise<'new' | 'resume' | 'exit'> {
  const hasExisting = existingSessions.length > 0;

  const menuText = [
    '\n# sofIA — AI Discovery Workshop\n',
    'Choose an option:\n',
    '  1. Start a new workshop session',
    hasExisting ? '  2. Resume an existing session' : '',
    '  3. Exit',
    '',
  ]
    .filter(Boolean)
    .join('\n');

  io.write(renderMarkdown(menuText, { isTTY: io.isTTY }));

  const answer = await io.readInput('Choose [1-3]: ');
  if (answer === null || answer.trim() === '3') return 'exit';
  if (answer.trim() === '2' && hasExisting) return 'resume';
  return 'new';
}

/**
 * Run the workshop flow for a session through its phases.
 */
async function runWorkshop(
  session: WorkshopSession,
  client: CopilotClient,
  io: ReturnType<typeof createLoopIO>,
  store: SessionStore,
  options: WorkshopCommandOptions,
  handlerConfig?: PhaseHandlerConfig,
): Promise<void> {
  const logger = getLogger();
  const phaseOrder = getPhaseOrder();
  let currentPhaseIdx = phaseOrder.indexOf(session.phase);
  if (currentPhaseIdx === -1) currentPhaseIdx = 0;

  // If a specific phase was requested, jump to it
  if (options.phase) {
    const requestedIdx = phaseOrder.indexOf(options.phase as PhaseValue);
    if (requestedIdx !== -1) {
      currentPhaseIdx = requestedIdx;
      session.phase = phaseOrder[currentPhaseIdx];
    }
  }

  while (currentPhaseIdx < phaseOrder.length) {
    const phase = phaseOrder[currentPhaseIdx];
    session.phase = phase;
    session.updatedAt = new Date().toISOString();
    await store.save(session);

    io.write(renderMarkdown(`\n## Phase: ${phase}\n`, { isTTY: io.isTTY }));

    // Create activity spinner for visual feedback
    const spinner = new ActivitySpinner({
      isTTY: io.isTTY,
      isJsonMode: io.isJsonMode,
      debugMode: options.debug,
    });

    // ── Develop phase: run Ralph Loop directly (FR-021) ─────────────────
    if (phase === 'Develop') {
      io.write(
        renderMarkdown(
          `\n### Starting PoC Generation\n\n` +
            `Now generating proof-of-concept code...\n`,
          { isTTY: io.isTTY },
        ),
      );

      try {
        const outputDir = join(process.cwd(), '..', 'poc', session.sessionId);
        const checkpoint = deriveCheckpointState(session, outputDir);
        const templateEntry = selectTemplate(
          createDefaultRegistry(),
          session.plan?.architectureNotes,
          session.plan?.dependencies,
        );
        const enricher = handlerConfig?.mcpManager
          ? new McpContextEnricher(handlerConfig.mcpManager)
          : undefined;

        const ralphLoop = new RalphLoop({
          client,
          io,
          session,
          spinner,
          maxIterations: 20,
          outputDir,
          enricher,
          onSessionUpdate: async (updated) => {
            session = updated;
            await store.save(session);
          },
          onEvent: (event: SofiaEvent) => {
            if (options.debug) {
              logger.debug('RalphLoop event', { event });
            }
          },
          checkpoint,
          templateEntry,
        });

        const result = await ralphLoop.run();
        session = result.session;

        if (result.finalStatus === 'success') {
          io.write(
            renderMarkdown(
              `\n✅ PoC generated successfully in ${result.outputDir}\n\n` +
                `Next steps:\n` +
                `- Review the generated code\n` +
                `- Run tests: \`cd ${result.outputDir} && npm test\`\n` +
                `- Continue developing: \`sofia dev --session ${session.sessionId}\`\n`,
              { isTTY: io.isTTY },
            ),
          );
        } else {
          io.write(
            renderMarkdown(
              `\n⚠️  PoC generation incomplete (${result.terminationReason})\n\n` +
                `To retry or resume PoC development:\n` +
                `\`\`\`\n` +
                `sofia dev --session ${session.sessionId}\n` +
                `\`\`\`\n`,
              { isTTY: io.isTTY },
            ),
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        io.write(
          renderMarkdown(
            `\n⚠️  PoC generation failed: ${msg}\n\n` +
              `To retry:\n` +
              `\`\`\`\n` +
              `sofia dev --session ${session.sessionId}\n` +
              `\`\`\`\n`,
            { isTTY: io.isTTY },
          ),
        );
      }

      session.updatedAt = new Date().toISOString();
      await store.save(session);
    } else {
      // ── All other phases: run ConversationLoop ───────────────────────
      const handler = createPhaseHandler(phase, handlerConfig);
      await handler._preload();

      const initialMessage = handler.getInitialMessage?.(session);
      const events: SofiaEvent[] = [];

      const loop = new ConversationLoop({
        client,
        io,
        session,
        phaseHandler: handler,
        initialMessage,
        spinner,
        onEvent: (e) => {
          events.push(e);
          if (options.debug && e.type === 'Activity') {
            io.writeActivity(e.message);
          }
        },
        onSessionUpdate: async (updatedSession) => {
          session = updatedSession;
          await store.save(session);
        },
      });

      session = await loop.run();
      session.updatedAt = new Date().toISOString();
      await store.save(session);
    }

    // Decision gate
    const gateResult = await io.showDecisionGate(phase);

    switch (gateResult.choice) {
      case 'continue': {
        const next = getNextPhase(phase);
        if (next) {
          currentPhaseIdx = phaseOrder.indexOf(next);
        } else {
          // Mark session as completed
          session.phase = 'Complete';
          session.status = 'Completed';
          session.updatedAt = new Date().toISOString();
          await store.save(session);

          io.write(
            renderMarkdown(
              '\n## Workshop Complete!\n\nUse `sofia export` to generate artifacts.\n',
              {
                isTTY: io.isTTY,
              },
            ),
          );
          return;
        }
        break;
      }
      case 'refine':
        // Stay on the same phase
        break;
      case 'menu':
        return; // Return to main menu
      case 'exit':
        session.status = 'Paused';
        session.updatedAt = new Date().toISOString();
        await store.save(session);
        io.write(
          renderMarkdown(
            `\nSession **${sessionDisplayName(session)}** paused. Resume later with \`sofia workshop --session ${session.sessionId}\`.\n`,
            { isTTY: io.isTTY },
          ),
        );
        return;
    }
  }
}

export async function workshopCommand(opts: WorkshopCommandOptions): Promise<void> {
  try {
    await workshopCommandInner(opts);
  } finally {
    // Clean up ephemeral web search agent on workshop exit (FR-015)
    await destroyWebSearchSession();
  }
}

async function workshopCommandInner(opts: WorkshopCommandOptions): Promise<void> {
  // FR-010: Load .env before any env var checks (e.g., isWebSearchConfigured)
  loadEnvFile(join(process.cwd(), '.env'));

  const store = createDefaultStore();
  const io = createLoopIO({
    json: opts.json,
    nonInteractive: opts.nonInteractive,
    debug: opts.debug,
  });

  // Get Copilot client
  let client: CopilotClient;
  try {
    client = await createCopilotClient();
  } catch (err: unknown) {
    const logger = getLogger();
    logger.error({ err }, 'Failed to create Copilot client — cannot start workshop');
    const msg = err instanceof Error ? err.message : 'Unknown error creating Copilot client';
    if (opts.json) {
      process.stdout.write(JSON.stringify({ error: msg }) + '\n');
    } else {
      console.error(`Error: ${msg}`);
    }
    process.exitCode = 1;
    return;
  }

  // FR-011: Create McpManager from .vscode/mcp.json
  let mcpManager: McpManager | undefined;
  try {
    const mcpConfigPath = join(process.cwd(), '.vscode', 'mcp.json');
    const mcpConfig = await loadMcpConfig(mcpConfigPath);
    mcpManager = new McpManager(mcpConfig);
  } catch {
    // MCP not configured — proceed without it
  }

  // FR-012: Create WebSearchClient when configured
  let webSearchClient: import('../phases/discoveryEnricher.js').WebSearchClient | undefined;
  if (isWebSearchConfigured()) {
    const config: WebSearchConfig = {
      projectEndpoint: process.env.FOUNDRY_PROJECT_ENDPOINT!,
      modelDeploymentName: process.env.FOUNDRY_MODEL_DEPLOYMENT_NAME!,
    };
    const searchFn = createWebSearchTool(config);
    webSearchClient = { search: searchFn };
  }

  // Build handler config with MCP + web search
  const handlerConfig: PhaseHandlerConfig = {
    discover: {
      io,
      mcpManager,
      webSearchClient,
    },
    mcpManager,
    webSearchClient,
  };

  // Direct session resumption
  if (opts.session) {
    if (await store.exists(opts.session)) {
      const session = await store.load(opts.session);
      io.write(
        renderMarkdown(`\nResuming session: **${sessionDisplayName(session)}**\n`, {
          isTTY: io.isTTY,
        }),
      );
      await runWorkshop(session, client, io, store, opts, handlerConfig);
    } else {
      const msg = `Session "${opts.session}" not found.`;
      if (opts.json) {
        process.stdout.write(JSON.stringify({ error: msg }) + '\n');
      } else {
        console.error(`Error: ${msg}`);
      }
      process.exitCode = 1;
    }
    return;
  }

  // New session flag
  if (opts.newSession) {
    const session = createNewSession();
    await store.save(session);
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ sessionId: session.sessionId, phase: session.phase }) + '\n',
      );
    } else {
      io.write(
        renderMarkdown(`\nNew session created: **${session.sessionId}**\n`, { isTTY: io.isTTY }),
      );
    }
    await runWorkshop(session, client, io, store, opts, handlerConfig);
    return;
  }

  // Interactive menu
  if (opts.nonInteractive) {
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ error: 'Non-interactive mode requires --session or --new-session.' }) +
          '\n',
      );
    } else {
      console.error('Error: Non-interactive mode requires --session or --new-session.');
    }
    process.exitCode = 1;
    return;
  }

  const existingSessions = await store.list();
  const choice = await showMainMenu(io, existingSessions);

  switch (choice) {
    case 'new': {
      const session = createNewSession();
      await store.save(session);
      io.write(renderMarkdown(`\nNew session: **${session.sessionId}**\n`, { isTTY: io.isTTY }));
      await runWorkshop(session, client, io, store, opts, handlerConfig);
      break;
    }
    case 'resume': {
      const sessions = await store.list();
      if (sessions.length === 0) {
        io.write('No existing sessions found.\n');
        break;
      }
      const sessionEntries = (
        await Promise.all(
          sessions.map(async (id) => {
            try {
              const session = await store.load(id);
              return { id, display: sessionDisplayName(session), session };
            } catch {
              return { id, display: id, session: undefined };
            }
          }),
        )
      ).filter((entry) => entry.display !== entry.id);

      // Show session list
      io.write('\nAvailable sessions:\n');
      sessionEntries.forEach((entry, idx) => {
        io.write(`  ${idx + 1}. ${entry.display}\n`);
      });
      const answer = await io.readInput('Choose session number: ');
      if (answer === null) break;
      const idx = parseInt(answer.trim(), 10) - 1;
      if (idx >= 0 && idx < sessionEntries.length) {
        const entry = sessionEntries[idx];
        const session = entry.session ?? (await store.load(entry.id));
        io.write(
          renderMarkdown(`\nResuming session: **${sessionDisplayName(session)}**\n`, {
            isTTY: io.isTTY,
          }),
        );
        await runWorkshop(session, client, io, store, opts, handlerConfig);
      } else {
        io.write('Invalid selection.\n');
      }
      break;
    }
    case 'exit':
      io.write('Goodbye!\n');
      break;
  }
}
