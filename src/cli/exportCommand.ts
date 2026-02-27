import { ExportWriter } from '../sessions/exportWriter';
import { SessionStore } from '../sessions/sessionStore';

export const runExport = async (sessionId: string, opts: { baseDir?: string } = {}) => {
  const store = new SessionStore();
  const session = await store.load(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  const writer = new ExportWriter({ baseDir: opts.baseDir });
  await writer.exportSession({ sessionId, artifacts: session.artifacts });
  const exportDir = `${opts.baseDir ?? './exports'}/${sessionId}`;
  return { sessionId, exportDir };
};