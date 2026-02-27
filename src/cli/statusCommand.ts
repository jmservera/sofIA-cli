import { SessionStore } from '../sessions/sessionStore';

export interface StatusResult {
  sessionId: string;
  phase: string;
  status: string;
  updatedAt: string;
  nextAction?: string;
}

export const runStatus = async (sessionId: string): Promise<StatusResult | null> => {
  const store = new SessionStore();
  const session = await store.load(sessionId);
  if (!session) return null;
  return {
    sessionId: session.sessionId,
    phase: session.phase,
    status: session.status,
    updatedAt: session.updatedAt,
    nextAction: 'continue',
  };
};