/**
 * Direct command mode (US3).
 *
 * Provides non-interactive and automation-friendly entry points:
 * - `sofia workshop --session <id> --phase <phase>` jumps to a specific phase
 * - Enforces required inputs in non-interactive mode
 * - JSON-only stdout when --json
 * - Retry transient failures when --retry specified
 */
import { ConversationLoop } from '../loop/conversationLoop.js';
import type { LoopIO } from '../loop/conversationLoop.js';
import type { CopilotClient } from '../shared/copilotClient.js';
import type { WorkshopSession, PhaseValue } from '../shared/schemas/session.js';
import { SessionStore } from '../sessions/sessionStore.js';
import { createPhaseHandler, getPhaseOrder } from '../phases/phaseHandlers.js';
import type { SofiaEvent } from '../shared/events.js';
import { classifyError, toUserMessage } from '../shared/errorClassifier.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DirectCommandOptions {
  sessionId: string;
  phase: PhaseValue;
  store: SessionStore;
  client: CopilotClient;
  io: LoopIO;
  nonInteractive?: boolean;
  json?: boolean;
  debug?: boolean;
  retry?: number;
}

export interface DirectCommandResult {
  exitCode: number;
  error?: string;
}

// ── Validation ───────────────────────────────────────────────────────────────

const VALID_PHASES = getPhaseOrder();

function validateInputs(opts: DirectCommandOptions): DirectCommandResult | null {
  if (!opts.sessionId) {
    const error = 'Required: --session <id>. Provide a session ID to target.';
    emitError(opts, error);
    return { exitCode: 1, error };
  }

  if (opts.nonInteractive && !opts.phase) {
    const error = 'Required: --phase <phase>. In non-interactive mode, a phase must be specified.';
    emitError(opts, error);
    return { exitCode: 1, error };
  }

  if (opts.phase && !VALID_PHASES.includes(opts.phase)) {
    const error = `Invalid phase "${opts.phase}". Valid phases: ${VALID_PHASES.join(', ')}`;
    emitError(opts, error);
    return { exitCode: 1, error };
  }

  return null; // validation passed
}

function emitError(opts: DirectCommandOptions, message: string): void {
  if (opts.json || opts.io.isJsonMode) {
    // JSON mode: follow the standard `{ error: "..." }` shape used by other commands
    opts.io.write(JSON.stringify({ error: message }) + '\n');
  } else {
    // Non-JSON mode: emit a human-readable error message so failures are visible
    opts.io.write(`Error: ${message}\n`);
  }
}

// ── Core execution ──────────────────────────────────────────────────────────

/**
 * Run a direct command: load session, execute phase, persist results.
 *
 * Supports retry for transient failures (connection, timeout, etc.).
 */
export async function runDirectCommand(opts: DirectCommandOptions): Promise<DirectCommandResult> {
  // 1. Validate inputs
  const validationError = validateInputs(opts);
  if (validationError) return validationError;

  // 2. Load session
  let session: WorkshopSession;
  try {
    if (!(await opts.store.exists(opts.sessionId))) {
      const error = `Session "${opts.sessionId}" not found.`;
      emitError(opts, error);
      return { exitCode: 1, error };
    }
    session = await opts.store.load(opts.sessionId);
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Failed to load session';
    emitError(opts, error);
    return { exitCode: 1, error };
  }

  // 3. Set phase
  if (opts.phase) {
    session.phase = opts.phase;
    session.updatedAt = new Date().toISOString();
    await opts.store.save(session);
  }

  // 4. Run phase with retry
  const maxAttempts = (opts.retry ?? 0) + 1;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      session = await runPhase(session, opts);
      return { exitCode: 0 };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const classification = classifyError(lastError);

      if (!classification.recoverable || attempt >= maxAttempts) {
        const error = lastError.message;
        emitError(opts, error);
        return { exitCode: 1, error };
      }

      // Log retry attempt
      opts.io.writeActivity(
        `Attempt ${attempt}/${maxAttempts} failed (${classification.category}): ${toUserMessage(classification)}. Retrying...`,
      );

      // Brief backoff before retry
      await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
    }
  }

  // Should not reach here, but safety net
  const error = lastError?.message ?? 'Unknown error';
  return { exitCode: 1, error };
}

// ── Phase runner ────────────────────────────────────────────────────────────

async function runPhase(
  session: WorkshopSession,
  opts: DirectCommandOptions,
): Promise<WorkshopSession> {
  const phase = session.phase;
  const handler = createPhaseHandler(phase);
  await handler._preload();

  const events: SofiaEvent[] = [];

  const loop = new ConversationLoop({
    client: opts.client,
    io: opts.io,
    session,
    phaseHandler: handler,
    onEvent: (e) => {
      events.push(e);
      if (opts.debug && e.type === 'Activity') {
        opts.io.writeActivity(e.message);
      }
    },
    onSessionUpdate: async (updatedSession) => {
      session = updatedSession;
      await opts.store.save(session);
    },
  });

  session = await loop.run();
  session.updatedAt = new Date().toISOString();
  await opts.store.save(session);

  // In JSON mode, emit result summary
  if (opts.json || opts.io.isJsonMode) {
    opts.io.write(
      JSON.stringify({
        sessionId: session.sessionId,
        phase: session.phase,
        status: session.status,
        updatedAt: session.updatedAt,
      }) + '\n',
    );
  }

  // Decision gate
  const gateResult = await opts.io.showDecisionGate(phase);
  if (gateResult.choice === 'exit') {
    session.status = 'Paused';
    session.updatedAt = new Date().toISOString();
    await opts.store.save(session);
  }

  return session;
}
