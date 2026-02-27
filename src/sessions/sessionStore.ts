import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { validateWorkshopSession, type WorkshopSession } from '../shared/schemas/session';

export interface SessionStoreOptions {
  baseDir?: string;
}

export class SessionStore {
  private readonly baseDir: string;

  constructor(opts: SessionStoreOptions = {}) {
    this.baseDir = opts.baseDir ?? join(process.cwd(), '.sofia', 'sessions');
  }

  private pathFor(sessionId: string): string {
    return join(this.baseDir, `${sessionId}.json`);
  }

  async save(session: WorkshopSession): Promise<void> {
    const now = new Date().toISOString();
    const payload: WorkshopSession = { ...session, updatedAt: now };
    validateWorkshopSession(payload);
    const path = this.pathFor(session.sessionId);
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, JSON.stringify(payload, null, 2), 'utf8');
  }

  async load(sessionId: string): Promise<WorkshopSession | null> {
    const path = this.pathFor(sessionId);
    try {
      const data = await fs.readFile(path, 'utf8');
      const parsed = JSON.parse(data);
      return validateWorkshopSession(parsed);
    } catch (err: any) {
      if (err?.code === 'ENOENT') return null;
      throw err;
    }
  }
}
