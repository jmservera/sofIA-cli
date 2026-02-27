import { SessionStore } from '../sessions/sessionStore';

export interface RunWorkshopOptions {
  mode: 'new' | 'resume';
  inputs?: { sessionName?: string; sessionId?: string };
}

import { runDiscoverPhase } from '../phases/discoverPhase';
import { runIdeatePhase } from '../phases/ideatePhase';
import type { WorkshopSession } from '../shared/schemas/session';
import { z } from '../vendor/zod';

// Minimal fake copilot client for early scaffolding
const fakeCopilot = {
  streamConversation: (_messages: any[]) => [{ type: 'text-delta', content: 'Prompt: tell me more' }],
};

// Minimal MCP stubs: integrate real clients later
const fakeMcp = {
  callWorkIQ: async () => ({ summary: 'WorkIQ summary stub' }),
  webSearch: async (_query: string) => ({ results: [{ title: 'Acme', url: 'https://acme.test' }] }),
};

const datasetPromise = (async () => {
  try {
    const { loadCardsDataset } = await import('../shared/data/cardsLoader');
    return loadCardsDataset();
  } catch {
    return { cards: [], categories: [] } as any;
  }
})();

export const runWorkshop = async (opts: RunWorkshopOptions) => {
  const store = new SessionStore();
  const sessionId = opts.inputs?.sessionId ?? `sess-${Date.now()}`;
  const baseSession: WorkshopSession = {
    sessionId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schemaVersion: '1.0.0',
    phase: 'Discover',
    status: 'Active',
    participants: [],
    artifacts: { exportDir: `./exports/${sessionId}`, generatedFiles: [] } as any,
    turns: [],
  } as any;
  // Phase: Discover
  const discoverState = await runDiscoverPhase({ state: baseSession, copilot: fakeCopilot as any, mcp: fakeMcp });
  await store.save(discoverState as any);

  // Phase: Ideate
  const cardsLoader = {
    loadCardsDataset: async () => await datasetPromise,
  } as any;
  const ideateState = await runIdeatePhase({ state: discoverState as any, copilot: fakeCopilot as any, cardsLoader });
  ideateState.phase = 'Plan'; // This stub goes straight to Plan for now
  ideateState.status = 'Completed';
  await store.save(ideateState as any);

  // Compose artifacts for return
  const phasesCompleted = ['Discover', 'Ideate', 'Design', 'Select', 'Plan'];
  return { sessionId, phasesCompleted, artifacts: ideateState.artifacts };
};
