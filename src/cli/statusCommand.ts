/**
 * Status command handler.
 *
 * Implements `sofia status` — displays session status and next expected action.
 * Supports both TTY (human-readable) and JSON output modes.
 */
import { createDefaultStore } from '../sessions/sessionStore.js';
import { renderTable } from '../shared/tableRenderer.js';
import { getNextPhase } from '../phases/phaseHandlers.js';

export interface StatusCommandOptions {
  session?: string;
  json?: boolean;
  debug?: boolean;
  logFile?: string;
  nonInteractive?: boolean;
}

export async function statusCommand(opts: StatusCommandOptions): Promise<void> {
  if (!opts.session) {
    // Try to list all sessions
    const store = createDefaultStore();
    const sessions = await store.list();

    if (sessions.length === 0) {
      if (opts.json) {
        process.stdout.write(JSON.stringify({ error: 'No sessions found. Start one with: sofia workshop --new-session' }) + '\n');
      } else {
        console.error('No sessions found. Start one with: sofia workshop --new-session');
      }
      process.exitCode = 1;
      return;
    }

    // Show all sessions
    if (opts.json) {
      const statuses = [];
      for (const id of sessions) {
        try {
          const s = await store.load(id);
          statuses.push({
            sessionId: s.sessionId,
            phase: s.phase,
            status: s.status,
            updatedAt: s.updatedAt,
          });
        } catch {
          statuses.push({ sessionId: id, error: 'Failed to load' });
        }
      }
      process.stdout.write(JSON.stringify({ sessions: statuses }) + '\n');
    } else {
      const rows: string[][] = [];
      for (const id of sessions) {
        try {
          const s = await store.load(id);
          rows.push([s.sessionId.slice(0, 8), s.phase, s.status, s.updatedAt]);
        } catch {
          rows.push([id.slice(0, 8), '?', 'Error', '?']);
        }
      }
      console.log(renderTable({
        head: ['Session', 'Phase', 'Status', 'Updated'],
        rows,
      }));
    }
    return;
  }

  const store = createDefaultStore();

  if (!(await store.exists(opts.session))) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ error: `Session "${opts.session}" not found.` }) + '\n');
    } else {
      console.error(`Error: Session "${opts.session}" not found.`);
    }
    process.exitCode = 1;
    return;
  }

  const session = await store.load(opts.session);

  if (opts.json) {
    const status = {
      sessionId: session.sessionId,
      phase: session.phase,
      status: session.status,
      nextPhase: getNextPhase(session.phase),
      turns: session.turns?.length ?? 0,
      participants: session.participants.length,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      hasBusinessContext: !!session.businessContext,
      hasWorkflow: !!session.workflow,
      ideaCount: session.ideas?.length ?? 0,
      hasSelection: !!session.selection,
      hasPlan: !!session.plan,
    };
    process.stdout.write(JSON.stringify(status) + '\n');
  } else {
    const next = getNextPhase(session.phase);
    console.log(`\nSession: ${session.sessionId}`);
    console.log(`Phase:   ${session.phase}`);
    console.log(`Status:  ${session.status}`);
    console.log(`Turns:   ${session.turns?.length ?? 0}`);
    console.log(`Updated: ${session.updatedAt}`);
    if (next) {
      console.log(`Next:    ${next}`);
    }
    console.log('');
  }
}
