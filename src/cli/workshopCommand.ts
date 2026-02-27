/**
 * Workshop command handler.
 *
 * Implements `sofia workshop` — the main interactive workshop command
 * with New Session, Resume Session, Status, and Export menu options.
 * Drives phase-by-phase conversation with decision gates.
 */
import { ConversationLoop } from '../loop/conversationLoop.js';
import { createCopilotClient } from '../shared/copilotClient.js';
import type { CopilotClient } from '../shared/copilotClient.js';
import { getLogger } from '../logging/logger.js';
import type { WorkshopSession, PhaseValue } from '../shared/schemas/session.js';
import { SessionStore, createDefaultStore } from '../sessions/sessionStore.js';
import { createLoopIO } from './ioContext.js';
import { createPhaseHandler, getPhaseOrder, getNextPhase } from '../phases/phaseHandlers.js';
import type { SofiaEvent } from '../shared/events.js';
import { renderMarkdown } from '../shared/markdownRenderer.js';

export interface WorkshopCommandOptions {
  session?: string;
  json?: boolean;
  debug?: boolean;
  logFile?: string;
  nonInteractive?: boolean;
  newSession?: boolean;
  phase?: string;
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
    '-', pad(d.getMonth() + 1),
    '-', pad(d.getDate()),
    '_', pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds()),
  ].join('');
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
): Promise<void> {
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

    // Create and preload the phase handler
    const handler = createPhaseHandler(phase);
    await handler._preload();

    const events: SofiaEvent[] = [];

    const loop = new ConversationLoop({
      client,
      io,
      session,
      phaseHandler: handler,
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

    // Run the conversation loop for this phase
    session = await loop.run();
    session.updatedAt = new Date().toISOString();
    await store.save(session);

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
            renderMarkdown('\n## Workshop Complete!\n\nUse `sofia export` to generate artifacts.\n', {
              isTTY: io.isTTY,
            }),
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
        io.write(renderMarkdown(`\nSession **${session.sessionId}** paused. Resume later with \`sofia workshop --session ${session.sessionId}\`.\n`, { isTTY: io.isTTY }));
        return;
    }
  }
}

export async function workshopCommand(opts: WorkshopCommandOptions): Promise<void> {
  const store = createDefaultStore();
  const io = createLoopIO({ json: opts.json, nonInteractive: opts.nonInteractive });

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

  // Direct session resumption
  if (opts.session) {
    if (await store.exists(opts.session)) {
      const session = await store.load(opts.session);
      await runWorkshop(session, client, io, store, opts);
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
      process.stdout.write(JSON.stringify({ sessionId: session.sessionId, phase: session.phase }) + '\n');
    } else {
      io.write(renderMarkdown(`\nNew session created: **${session.sessionId}**\n`, { isTTY: io.isTTY }));
    }
    await runWorkshop(session, client, io, store, opts);
    return;
  }

  // Interactive menu
  if (opts.nonInteractive) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ error: 'Non-interactive mode requires --session or --new-session.' }) + '\n');
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
      await runWorkshop(session, client, io, store, opts);
      break;
    }
    case 'resume': {
      const sessions = await store.list();
      if (sessions.length === 0) {
        io.write('No existing sessions found.\n');
        break;
      }
      // Show session list
      io.write('\nAvailable sessions:\n');
      sessions.forEach((id, idx) => {
        io.write(`  ${idx + 1}. ${id}\n`);
      });
      const answer = await io.readInput('Choose session number: ');
      if (answer === null) break;
      const idx = parseInt(answer.trim(), 10) - 1;
      if (idx >= 0 && idx < sessions.length) {
        const session = await store.load(sessions[idx]);
        await runWorkshop(session, client, io, store, opts);
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
