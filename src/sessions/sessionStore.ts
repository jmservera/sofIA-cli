/**
 * Session persistence adapter.
 *
 * Reads/writes WorkshopSession JSON files to .sofia/sessions/<sessionId>.json.
 * Uses write-then-rename for atomic writes.
 */
import { readFile, writeFile, mkdir, readdir, unlink, rename, access } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

import { workshopSessionSchema, type WorkshopSession } from '../shared/schemas/session.js';

export class SessionStore {
  constructor(private readonly baseDir: string) {}

  /** Persist a session atomically (write to temp, rename). */
  async save(session: WorkshopSession): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
    const filePath = this.filePath(session.sessionId);
    const tmpPath = filePath + '.tmp.' + randomBytes(4).toString('hex');
    const json = JSON.stringify(session, null, 2);
    await writeFile(tmpPath, json, 'utf-8');
    await rename(tmpPath, filePath);
  }

  /** Load and validate a session by ID. Throws if not found or invalid. */
  async load(sessionId: string): Promise<WorkshopSession> {
    const filePath = this.filePath(sessionId);
    const raw = await readFile(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    return workshopSessionSchema.parse(parsed);
  }

  /** List all session IDs in the store. */
  async list(): Promise<string[]> {
    try {
      const files = await readdir(this.baseDir);
      return files
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''));
    } catch {
      return [];
    }
  }

  /** Check if a session exists. */
  async exists(sessionId: string): Promise<boolean> {
    try {
      await access(this.filePath(sessionId));
      return true;
    } catch {
      return false;
    }
  }

  /** Delete a session file. */
  async delete(sessionId: string): Promise<void> {
    await unlink(this.filePath(sessionId));
  }

  private filePath(sessionId: string): string {
    return join(this.baseDir, `${sessionId}.json`);
  }
}

/** Default store location relative to CWD: .sofia/sessions/ */
export function createDefaultStore(): SessionStore {
  return new SessionStore(join(process.cwd(), '.sofia', 'sessions'));
}
