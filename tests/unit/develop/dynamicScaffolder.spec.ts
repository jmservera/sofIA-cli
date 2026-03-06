/**
 * Unit tests for DynamicScaffolder.
 *
 * Verifies:
 * - Configurable timeout is passed to session creation
 * - Conversation turns are summarized in the scaffold prompt
 * - Scaffold generation writes files to disk
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createFakeCopilotClient } from '../../../src/shared/copilotClient.js';
import type { SessionOptions } from '../../../src/shared/copilotClient.js';
import { generateDynamicScaffold } from '../../../src/develop/dynamicScaffolder.js';
import type { WorkshopSession } from '../../../src/shared/schemas/session.js';

// Mock exportWorkshopDocs so it doesn't try real file writes
vi.mock('../../../src/sessions/exportWriter.js', () => ({
  exportWorkshopDocs: vi.fn().mockResolvedValue({ createdFiles: [] }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSession(overrides?: Partial<WorkshopSession>): WorkshopSession {
  const now = new Date().toISOString();
  return {
    sessionId: 'scaffold-test',
    schemaVersion: '1.0.0',
    createdAt: now,
    updatedAt: now,
    phase: 'Develop',
    status: 'Active',
    participants: [],
    artifacts: { generatedFiles: [] },
    selection: { ideaId: 'idea-1', selectionRationale: 'Best fit' },
    ideas: [{ id: 'idea-1', title: 'Smart Widget', description: 'An AI widget' }],
    ...overrides,
  } as WorkshopSession;
}

const SCAFFOLD_RESPONSE = `Here is the scaffold:

\`\`\`json file=package.json
{
  "name": "smart-widget",
  "scripts": { "test": "vitest run" }
}
\`\`\`

\`\`\`typescript file=src/index.ts
export function main() { throw new Error("Not implemented"); }
\`\`\`
`;

describe('DynamicScaffolder', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'scaffold-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // ── Configurable timeout ───────────────────────────────────────────────

  describe('configurable timeout', () => {
    it('forwards timeout option to client.createSession', async () => {
      const createSessionSpy = vi.fn();
      const client = createFakeCopilotClient([
        { role: 'assistant', content: SCAFFOLD_RESPONSE },
      ]);
      const originalCreateSession = client.createSession.bind(client);
      client.createSession = async (opts: SessionOptions) => {
        createSessionSpy(opts);
        return originalCreateSession(opts);
      };

      await generateDynamicScaffold({
        session: makeSession(),
        outputDir: tmpDir,
        client,
      });

      const passedOpts = createSessionSpy.mock.calls[0][0] as SessionOptions;
      // Scaffold sessions should request a longer timeout than the default 120s
      expect(passedOpts.timeout).toBeDefined();
      expect(passedOpts.timeout).toBeGreaterThan(120_000);
    });
  });

  // ── Conversation turn summarization ────────────────────────────────────

  describe('conversation turn summarization', () => {
    it('includes a workshop conversation summary in the prompt when turns exist', async () => {
      let capturedPrompt = '';
      const client = createFakeCopilotClient([
        { role: 'assistant', content: SCAFFOLD_RESPONSE },
      ]);
      const originalCreateSession = client.createSession.bind(client);
      client.createSession = async (opts: SessionOptions) => {
        const session = await originalCreateSession(opts);
        const originalSend = session.send.bind(session);
        session.send = (msg) => {
          capturedPrompt = msg.content;
          return originalSend(msg);
        };
        return session;
      };

      const turns = [
        {
          phase: 'Discover' as const,
          sequence: 1,
          role: 'user' as const,
          content: 'We are Zava, a fintech company.',
          timestamp: new Date().toISOString(),
        },
        {
          phase: 'Discover' as const,
          sequence: 2,
          role: 'assistant' as const,
          content: 'Thank you! What are your main challenges?',
          timestamp: new Date().toISOString(),
        },
        {
          phase: 'Ideate' as const,
          sequence: 3,
          role: 'user' as const,
          content: 'We need faster loan approvals.',
          timestamp: new Date().toISOString(),
        },
        {
          phase: 'Ideate' as const,
          sequence: 4,
          role: 'assistant' as const,
          content: 'Here are some AI ideas for loan processing.',
          timestamp: new Date().toISOString(),
        },
      ];

      await generateDynamicScaffold({
        session: makeSession({ turns }),
        outputDir: tmpDir,
        client,
      });

      // Prompt should mention the workshop conversation summary
      expect(capturedPrompt).toContain('Workshop Conversation Summary');
      // Should include content from turns
      expect(capturedPrompt).toContain('Zava');
      expect(capturedPrompt).toContain('loan');
    });

    it('omits conversation summary when no turns exist', async () => {
      let capturedPrompt = '';
      const client = createFakeCopilotClient([
        { role: 'assistant', content: SCAFFOLD_RESPONSE },
      ]);
      const originalCreateSession = client.createSession.bind(client);
      client.createSession = async (opts: SessionOptions) => {
        const session = await originalCreateSession(opts);
        const originalSend = session.send.bind(session);
        session.send = (msg) => {
          capturedPrompt = msg.content;
          return originalSend(msg);
        };
        return session;
      };

      await generateDynamicScaffold({
        session: makeSession({ turns: undefined }),
        outputDir: tmpDir,
        client,
      });

      expect(capturedPrompt).not.toContain('Workshop Conversation Summary');
    });
  });

  // ── File generation ────────────────────────────────────────────────────

  describe('file generation', () => {
    it('writes parsed code blocks to disk', async () => {
      const client = createFakeCopilotClient([
        { role: 'assistant', content: SCAFFOLD_RESPONSE },
      ]);

      const result = await generateDynamicScaffold({
        session: makeSession(),
        outputDir: tmpDir,
        client,
      });

      expect(result.createdFiles).toContain('package.json');
      expect(result.createdFiles).toContain('src/index.ts');

      const content = await readFile(join(tmpDir, 'package.json'), 'utf-8');
      expect(content).toContain('smart-widget');
    });
  });
});
