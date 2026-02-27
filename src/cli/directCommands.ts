import { runWorkshop } from './workshopCommand';
import { runStatus } from './statusCommand';
import { runExport } from './exportCommand';

export interface DirectOptions {
  sessionId?: string;
  phase?: string;
  json?: boolean;
  retry?: number;
  isTTY?: boolean;
}

const isTTY = () => Boolean(process.stdout.isTTY);

export const runDirect = async (opts: DirectOptions) => {
  const tty = opts.isTTY ?? isTTY();
  if (!tty && !opts.sessionId) {
    throw new Error('Missing required --session in non-TTY mode');
  }
  if (opts.phase) {
    // direct phase execution not yet implemented
  }
  const sessionId = opts.sessionId;
  if (!sessionId) {
    const result = await runWorkshop({ mode: 'new', inputs: {} });
    return result;
  }
  const status = await runStatus(sessionId);
  if (!status) throw new Error(`Session not found: ${sessionId}`);
  return status;
};