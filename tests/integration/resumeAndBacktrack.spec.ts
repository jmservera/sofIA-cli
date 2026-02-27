/**
 * Integration test: Resume and Backtrack flow (T036)
 *
 * Tests the resume, backtrack, and artifact invalidation flows:
 * - Resume an existing session and continue from the current phase
 * - Backtrack to an earlier phase with deterministic invalidation
 * - Verify downstream data is cleared after backtrack
 * - Verify handler detects cleaned state as incomplete
 * - Re-run a phase and produce fresh results after backtrack
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ConversationLoop } from '../../src/loop/conversationLoop.js';
import type { LoopIO, DecisionGateResult } from '../../src/loop/conversationLoop.js';
import { createFakeCopilotClient } from '../../src/shared/copilotClient.js';
import type { WorkshopSession, PhaseValue } from '../../src/shared/schemas/session.js';
import { SessionStore } from '../../src/sessions/sessionStore.js';
import { createPhaseHandler, getPhaseOrder } from '../../src/phases/phaseHandlers.js';
import { backtrackSession } from '../../src/sessions/sessionManager.js';
import type { SofiaEvent } from '../../src/shared/events.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createTestSession(overrides?: Partial<WorkshopSession>): WorkshopSession {
  const now = new Date().toISOString();
  return {
    sessionId: 'test-resume-session',
    schemaVersion: '1.0.0',
    createdAt: now,
    updatedAt: now,
    phase: 'Discover',
    status: 'Active',
    participants: [],
    artifacts: { generatedFiles: [] },
    turns: [],
    ...overrides,
  };
}

function createScriptedIO(
  inputs: (string | null)[],
  decisionGateChoice: DecisionGateResult = { choice: 'continue' },
): LoopIO & { output: string[]; activityLog: string[] } {
  let inputIdx = 0;
  const output: string[] = [];
  const activityLog: string[] = [];

  return {
    write(text: string) {
      output.push(text);
    },
    writeActivity(text: string) {
      activityLog.push(text);
    },
    async readInput(_prompt?: string): Promise<string | null> {
      if (inputIdx >= inputs.length) return null;
      return inputs[inputIdx++];
    },
    async showDecisionGate(_phase: PhaseValue): Promise<DecisionGateResult> {
      return decisionGateChoice;
    },
    isJsonMode: false,
    isTTY: false,
    output,
    activityLog,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Resume and Backtrack Flow', () => {
  let tmpDir: string;
  let store: SessionStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sofia-resume-'));
    store = new SessionStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('resumes an existing session from disk', async () => {
    // Save a session mid-Ideate
    const session = createTestSession({
      phase: 'Ideate',
      businessContext: {
        businessDescription: 'Logistics company',
        challenges: ['Slow deliveries'],
      },
      workflow: {
        activities: [{ id: 'a1', name: 'Route Planning' }],
        edges: [],
      },
    });
    await store.save(session);

    // Load it back (resume)
    const loaded = await store.load(session.sessionId);
    expect(loaded.phase).toBe('Ideate');
    expect(loaded.businessContext!.businessDescription).toBe('Logistics company');
  });

  it('resumes and continues Ideate phase with ConversationLoop', async () => {
    const session = createTestSession({
      phase: 'Ideate',
      businessContext: {
        businessDescription: 'Logistics company',
        challenges: ['Slow deliveries'],
      },
      workflow: {
        activities: [{ id: 'a1', name: 'Route Planning' }],
        edges: [],
      },
    });
    await store.save(session);

    const loaded = await store.load(session.sessionId);
    const client = createFakeCopilotClient([
      { role: 'assistant', content: 'Let me help you brainstorm ideas for optimizing routes.' },
    ]);
    const io = createScriptedIO(['Can we use AI for routing?', null]);
    const handler = createPhaseHandler('Ideate');
    await handler._preload();

    const loop = new ConversationLoop({
      client,
      io,
      session: loaded,
      phaseHandler: handler,
      onEvent: () => {},
      onSessionUpdate: async (s) => { await store.save(s); },
    });

    const result = await loop.run();
    expect(result.turns.length).toBeGreaterThan(0);
  });

  it('backtracks from Design to Ideate and clears downstream data', async () => {
    const session = createTestSession({
      phase: 'Design',
      businessContext: {
        businessDescription: 'ACME Corp',
        challenges: ['Cost reduction'],
      },
      workflow: {
        activities: [{ id: 'a1', name: 'Procurement' }],
        edges: [],
      },
      ideas: [
        { id: 'i1', title: 'AI Procurement', description: 'Automated purchasing', workflowStepIds: ['a1'] },
      ],
      evaluation: {
        method: 'feasibility-value-matrix',
        ideas: [{ ideaId: 'i1', feasibility: 4, value: 5 }],
      },
      turns: [
        { phase: 'Discover', sequence: 1, role: 'user', content: 'hello', timestamp: new Date().toISOString() },
        { phase: 'Ideate', sequence: 2, role: 'user', content: 'ideas', timestamp: new Date().toISOString() },
        { phase: 'Design', sequence: 3, role: 'user', content: 'evaluate', timestamp: new Date().toISOString() },
      ],
    });
    await store.save(session);

    const loaded = await store.load(session.sessionId);
    const result = backtrackSession(loaded, 'Ideate');

    expect(result.success).toBe(true);
    expect(result.session.phase).toBe('Ideate');
    expect(result.session.ideas).toBeUndefined();
    expect(result.session.evaluation).toBeUndefined();
    // Discover data preserved
    expect(result.session.businessContext).toBeDefined();
    // Only Discover turns remain
    expect(result.session.turns?.length).toBe(1);
    expect(result.session.turns![0].phase).toBe('Discover');

    // Save backtracked session
    await store.save(result.session);
    const reloaded = await store.load(session.sessionId);
    expect(reloaded.phase).toBe('Ideate');
  });

  it('re-runs Ideate after backtrack and produces fresh ideas', async () => {
    const session = createTestSession({
      phase: 'Ideate',
      status: 'Active',
      businessContext: {
        businessDescription: 'ACME Corp',
        challenges: ['Cost reduction'],
      },
    });

    // LLM returns fresh ideas in JSON
    const client = createFakeCopilotClient([
      {
        role: 'assistant',
        content: '```json\n[{"id": "new-1", "title": "Smart Scheduling", "description": "AI scheduling", "workflowStepIds": ["a1"]}]\n```',
      },
    ]);
    const io = createScriptedIO(['Generate new ideas', null]);
    const handler = createPhaseHandler('Ideate');
    await handler._preload();

    const loop = new ConversationLoop({
      client,
      io,
      session,
      phaseHandler: handler,
      onEvent: () => {},
      onSessionUpdate: async (s) => { await store.save(s); },
    });

    const result = await loop.run();
    // The extractResult should have captured the ideas
    expect(result.ideas).toBeDefined();
    expect(result.ideas!.length).toBeGreaterThan(0);
    expect(result.ideas![0].id).toBe('new-1');
  });

  it('backtrack to Discover clears all downstream phase data', () => {
    const session = createTestSession({
      phase: 'Plan',
      businessContext: {
        businessDescription: 'Tech Co',
        challenges: ['Scaling'],
      },
      workflow: {
        activities: [{ id: 'a1', name: 'Deploy' }],
        edges: [],
      },
      ideas: [
        { id: 'i1', title: 'Auto-scale', description: 'Auto scaling', workflowStepIds: ['a1'] },
      ],
      evaluation: {
        method: 'feasibility-value-matrix',
        ideas: [{ ideaId: 'i1', feasibility: 5, value: 5 }],
      },
      selection: {
        ideaId: 'i1',
        selectionRationale: 'Only option',
        confirmedByUser: true,
      },
      plan: {
        milestones: [{ id: 'm1', title: 'Phase 1', items: ['Setup'] }],
      },
    });

    const result = backtrackSession(session, 'Discover');
    expect(result.success).toBe(true);
    expect(result.invalidatedPhases).toContain('Discover');
    expect(result.invalidatedPhases).toContain('Ideate');
    expect(result.invalidatedPhases).toContain('Design');
    expect(result.invalidatedPhases).toContain('Select');
    expect(result.invalidatedPhases).toContain('Plan');

    const s = result.session;
    expect(s.businessContext).toBeUndefined();
    expect(s.workflow).toBeUndefined();
    expect(s.ideas).toBeUndefined();
    expect(s.evaluation).toBeUndefined();
    expect(s.selection).toBeUndefined();
    expect(s.plan).toBeUndefined();
  });

  it('forward backtrack is rejected', () => {
    const session = createTestSession({ phase: 'Ideate' });
    const result = backtrackSession(session, 'Plan');
    expect(result.success).toBe(false);
    expect(result.error).toContain('forward');
  });
});
