import { SessionStore } from './sessionStore';
import type { WorkshopSession } from '../shared/schemas/session';

const PHASE_ORDER = ['Discover', 'Ideate', 'Design', 'Select', 'Plan', 'Develop', 'Complete'];

export class SessionManager {
  private store: SessionStore;

  constructor(opts: { store?: SessionStore } = {}) {
    this.store = opts.store ?? new SessionStore();
  }

  async resume(sessionId: string): Promise<WorkshopSession | null> {
    return this.store.load(sessionId);
  }

  async backtrack(sessionId: string, targetPhase: string): Promise<WorkshopSession | null> {
    const session = await this.store.load(sessionId);
    if (!session) return null;
    const targetIndex = PHASE_ORDER.indexOf(targetPhase);
    if (targetIndex === -1) throw new Error(`Unknown phase ${targetPhase}`);
    // Invalidate downstream artifacts
    const artifacts = { ...(session.artifacts as any) };
    const downstream = ['Design', 'Select', 'Plan', 'Develop'];
    downstream.forEach((p) => {
      if (PHASE_ORDER.indexOf(p) > targetIndex) {
        delete artifacts[p.toLowerCase()];
      }
    });
    const updated: any = { ...session, phase: targetPhase, artifacts };
    await this.store.save(updated);
    return updated;
  }
}
