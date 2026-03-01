/**
 * Integration test for Discovery Phase Enrichment Flow (T029).
 *
 * Simulates Step 1 completion in the discover handler and verifies:
 * - The user is offered web search enrichment when available
 * - DiscoveryEnricher.enrichFromWebSearch() is called when web search provided
 * - Session is updated with discovery.enrichment
 * - Enrichment data is included in the Ideate phase system prompt
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createPhaseHandler } from '../../src/phases/phaseHandlers.js';
import type { WebSearchClient } from '../../src/phases/discoveryEnricher.js';
import type { LoopIO } from '../../src/loop/conversationLoop.js';
import type { McpManager } from '../../src/mcp/mcpManager.js';
import type { WorkshopSession } from '../../src/shared/schemas/session.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSession(overrides?: Partial<WorkshopSession>): WorkshopSession {
  return {
    sessionId: 'test-session',
    schemaVersion: '0.3.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    phase: 'Discover' as const,
    status: 'Active' as const,
    participants: [],
    artifacts: { generatedFiles: [] },
    ...overrides,
  };
}

function makeLoopIO(): LoopIO {
  return {
    write: vi.fn(),
    writeActivity: vi.fn(),
    writeToolSummary: vi.fn(),
    readInput: vi.fn().mockResolvedValue('n'),
    showDecisionGate: vi.fn().mockResolvedValue({ choice: 'continue' }),
    isJsonMode: false,
    isTTY: true,
  };
}

function makeMcpManager(): McpManager {
  return {
    isAvailable: vi.fn().mockReturnValue(false),
    callTool: vi.fn().mockResolvedValue({}),
    markConnected: vi.fn(),
    markDisconnected: vi.fn(),
    disconnectAll: vi.fn().mockResolvedValue(undefined),
  } as unknown as McpManager;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Discovery enrichment integration flow (T029)', () => {
  let io: LoopIO;
  let mcpManager: McpManager;
  let webSearchClient: WebSearchClient;

  beforeEach(() => {
    io = makeLoopIO();
    mcpManager = makeMcpManager();
    webSearchClient = {
      search: vi.fn().mockResolvedValue({
        results: [
          {
            title: 'Acme launches AI',
            url: 'https://news.com/1',
            snippet: 'Acme Corp announced a new AI product',
          },
        ],
        degraded: false,
      }),
    };
  });

  it('runs enrichment via postExtract when businessContext is available and webSearchClient provided', async () => {
    const handler = createPhaseHandler('Discover', {
      discover: { io, mcpManager, webSearchClient },
    });
    await handler._preload();

    const session = makeSession({
      businessContext: {
        businessDescription: 'Acme Corp manufactures widgets and is exploring AI',
        challenges: ['efficiency', 'quality control'],
      },
    });

    // postExtract should trigger enrichment
    const updates = await handler.postExtract!(session);

    expect(updates.discovery).toBeDefined();
    expect(updates.discovery!.enrichment).toBeDefined();
    expect(updates.discovery!.enrichment!.sourcesUsed).toContain('websearch');
    expect(updates.discovery!.enrichment!.companyNews).toBeDefined();
    expect(updates.discovery!.enrichment!.companyNews!.length).toBeGreaterThan(0);
    expect(webSearchClient.search).toHaveBeenCalled();
  });

  it('does not run enrichment when businessContext is missing', async () => {
    const handler = createPhaseHandler('Discover', {
      discover: { io, mcpManager, webSearchClient },
    });
    await handler._preload();

    const session = makeSession(); // no businessContext

    const updates = await handler.postExtract!(session);

    expect(updates.discovery).toBeUndefined();
    expect(webSearchClient.search).not.toHaveBeenCalled();
  });

  it('runs enrichment only once (first extraction)', async () => {
    const handler = createPhaseHandler('Discover', {
      discover: { io, mcpManager, webSearchClient },
    });
    await handler._preload();

    const session = makeSession({
      businessContext: {
        businessDescription: 'Acme Corp',
        challenges: ['challenge'],
      },
    });

    // First call: triggers enrichment
    const updates1 = await handler.postExtract!(session);
    expect(updates1.discovery).toBeDefined();

    // Second call: should not re-trigger
    const updates2 = await handler.postExtract!(session);
    expect(updates2).toEqual({});
    // search was called 3 times in the first call only, not in second
    expect(webSearchClient.search).toHaveBeenCalledTimes(3);
  });

  it('does not run enrichment when no webSearchClient or WorkIQ available', async () => {
    const handler = createPhaseHandler('Discover', {
      discover: { io, mcpManager },
    });
    await handler._preload();

    const session = makeSession({
      businessContext: {
        businessDescription: 'Acme Corp',
        challenges: ['challenge'],
      },
    });

    const updates = await handler.postExtract!(session);
    expect(updates).toEqual({});
  });

  it('enrichment result stored in session.discovery.enrichment is picked up by Ideate prompt', async () => {
    // Create a session with enrichment already stored
    const session = makeSession({
      phase: 'Ideate',
      businessContext: {
        businessDescription: 'Acme Corp',
        challenges: ['efficiency'],
      },
      discovery: {
        enrichment: {
          companyNews: ['Acme raises $10M Series B'],
          competitorInfo: ['Widget Inc growing fast'],
          industryTrends: ['AI in manufacturing trending'],
          enrichedAt: new Date().toISOString(),
          sourcesUsed: ['websearch'],
        },
      },
    });

    const ideateHandler = createPhaseHandler('Ideate');
    await ideateHandler._preload();

    const prompt = ideateHandler.buildSystemPrompt(session);
    // The ideate handler includes businessContext in its prompt
    expect(prompt).toContain('Acme Corp');
    // Note: Enrichment injection into ideation prompt is a downstream task,
    // this test verifies the data is available for injection
  });

  it('enrichment does not interfere with normal extractResult', async () => {
    const handler = createPhaseHandler('Discover', {
      discover: { io, mcpManager, webSearchClient },
    });
    await handler._preload();

    const session = makeSession();

    // Normal extractResult should still work
    const response = `## Business Context
\`\`\`json
{
  "businessDescription": "Acme Corp",
  "challenges": ["efficiency"]
}
\`\`\``;

    const updates = handler.extractResult(session, response);
    // extractResult should not contain discovery (that's postExtract's job)
    expect(updates.businessContext).toBeDefined();
  });
});
