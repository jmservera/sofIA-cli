import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WorkshopSession } from '../../src/shared/schemas/session';
import { SessionStore } from '../../src/sessions/sessionStore';

const makeSession = (): WorkshopSession => ({
  sessionId: 'test-session',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  schemaVersion: '1.0.0',
  phase: 'Discover',
  status: 'Active',
  participants: [],
  businessContext: {},
  topic: {},
  activities: [],
  workflow: {},
  cards: [],
  ideas: [],
  evaluation: {},
  selection: {},
  plan: {},
  poc: { iterations: [] },
  artifacts: { exportDir: './exports/test-session', generatedFiles: [] } as any,
  errors: [],
  turns: [],
});

describe('SessionStore', () => {
  let baseDir: string;
  let store: SessionStore;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'sofia-session-'));
    store = new SessionStore({ baseDir });
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it('persists and reads a session JSON at ./.sofia/sessions/<sessionId>.json', async () => {
    const session = makeSession();
    await store.save(session);
    const loaded = await store.load(session.sessionId);
    expect(loaded?.sessionId).toBe(session.sessionId);
    expect(loaded?.phase).toBe('Discover');
    expect(loaded?.artifacts?.exportDir).toBeDefined();
  });

  it('updates updatedAt and writes after every turn', async () => {
    const session = makeSession();
    await store.save(session);
    const after = { ...session, turns: [{ phase: 'Discover', role: 'user', content: 'hi', timestamp: new Date().toISOString(), metadata: {} }] };
    await store.save(after);
    const loaded = await store.load(session.sessionId);
    expect(loaded?.turns?.length).toBe(1);
    expect(new Date(loaded!.updatedAt).getTime()).toBeGreaterThan(new Date(session.updatedAt).getTime());
  });

  it('returns null when session is not found', async () => {
    const loaded = await store.load('does-not-exist');
    expect(loaded).toBeNull();
  });
});
