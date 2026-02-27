/**
 * Unit tests for session persistence adapter.
 *
 * Contract: .sofia/sessions/<sessionId>.json
 * - Atomic write (write-then-rename)
 * - Persists after every turn
 * - Preserves unknown fields
 * - Never persists secrets
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { SessionStore } from '../../../src/sessions/sessionStore.js';
import type { WorkshopSession } from '../../../src/shared/schemas/session.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function minimalSession(id: string = 'sess-001'): WorkshopSession {
  return {
    sessionId: id,
    schemaVersion: '1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    phase: 'Discover',
    status: 'Active',
    participants: [],
    artifacts: { generatedFiles: [] },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SessionStore', () => {
  let tmpDir: string;
  let store: SessionStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sofia-test-'));
    store = new SessionStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('saves and loads a session', async () => {
    const session = minimalSession();
    await store.save(session);
    const loaded = await store.load('sess-001');
    expect(loaded.sessionId).toBe('sess-001');
    expect(loaded.phase).toBe('Discover');
  });

  it('creates the sessions directory on first save', async () => {
    const nestedDir = join(tmpDir, 'nested', 'sessions');
    const nestedStore = new SessionStore(nestedDir);
    await nestedStore.save(minimalSession());
    const files = await readdir(nestedDir);
    expect(files).toContain('sess-001.json');
  });

  it('overwrites existing session file on re-save', async () => {
    const session = minimalSession();
    await store.save(session);
    const updated = { ...session, updatedAt: '2026-06-01T00:00:00Z', phase: 'Ideate' as const };
    await store.save(updated);
    const loaded = await store.load('sess-001');
    expect(loaded.phase).toBe('Ideate');
    expect(loaded.updatedAt).toBe('2026-06-01T00:00:00Z');
  });

  it('preserves unknown fields (forward compatibility)', async () => {
    const session = minimalSession() as WorkshopSession & { futureField: string };
    session.futureField = 'hello-future';
    await store.save(session);
    const loaded = await store.load('sess-001');
    expect((loaded as Record<string, unknown>).futureField).toBe('hello-future');
  });

  it('throws when loading a non-existent session', async () => {
    await expect(store.load('nonexistent')).rejects.toThrow();
  });

  it('lists sessions', async () => {
    await store.save(minimalSession('a'));
    await store.save(minimalSession('b'));
    const ids = await store.list();
    expect(ids.sort()).toEqual(['a', 'b']);
  });

  it('returns empty list when no sessions exist', async () => {
    const ids = await store.list();
    expect(ids).toEqual([]);
  });

  it('checks existence of a session', async () => {
    await store.save(minimalSession());
    expect(await store.exists('sess-001')).toBe(true);
    expect(await store.exists('nope')).toBe(false);
  });

  it('writes valid JSON that can be parsed independently', async () => {
    await store.save(minimalSession());
    const filePath = join(tmpDir, 'sess-001.json');
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.sessionId).toBe('sess-001');
  });

  it('deletes a session', async () => {
    await store.save(minimalSession());
    expect(await store.exists('sess-001')).toBe(true);
    await store.delete('sess-001');
    expect(await store.exists('sess-001')).toBe(false);
  });

  it('handles concurrent saves to different sessions', async () => {
    await Promise.all([
      store.save(minimalSession('c1')),
      store.save(minimalSession('c2')),
      store.save(minimalSession('c3')),
    ]);
    const ids = await store.list();
    expect(ids.sort()).toEqual(['c1', 'c2', 'c3']);
  });

  it('rejects session with invalid schema on load', async () => {
    // Write an invalid file directly
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'bad.json'), JSON.stringify({ invalid: true }));
    await expect(store.load('bad')).rejects.toThrow();
  });
});
