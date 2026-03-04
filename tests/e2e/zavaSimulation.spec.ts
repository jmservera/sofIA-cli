/**
 * End-to-end interactive simulation with Zava Industries script.
 *
 * This test simulates a complete workshop session using the Zava Industries
 * agent interaction script. It exercises the full code path:
 * - All 6 workshop phases (Discover → Ideate → Design → Select → Plan → Develop)
 * - ConversationLoop with post-phase summarization
 * - Phase boundary enforcement
 * - Context summarization across phases
 * - Export with conversation fallback
 *
 * Uses a fake CopilotClient that returns scripted LLM responses with
 * embedded JSON blocks for structured data extraction.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ConversationLoop } from '../../src/loop/conversationLoop.js';
import type { LoopIO } from '../../src/loop/conversationLoop.js';
import type { CopilotClient, ConversationSession, SessionOptions } from '../../src/shared/copilotClient.js';
import type { WorkshopSession, PhaseValue } from '../../src/shared/schemas/session.js';
import { createPhaseHandler, getPhaseOrder } from '../../src/phases/phaseHandlers.js';
import { exportSession } from '../../src/sessions/exportWriter.js';
import { buildSummarizedContext, renderSummarizedContext } from '../../src/phases/contextSummarizer.js';

// ── Zava scripted responses ─────────────────────────────────────────────────

const ZAVA_USER_INPUTS: Record<PhaseValue, string[]> = {
  Discover: [
    'We are Zava Industries, a mid-premium fashion company based in Milan. Our biggest challenge is speed in trend analysis.',
    "I'd like to focus on Trend Intelligence and Signal Aggregation.",
    'done',
  ],
  Ideate: [
    'I love these ideas: TrendLens, TrendPulse Dashboard, AutoBrief Generator, Celebrity Impact Tracker, Trend Predictor.',
    'done',
  ],
  Design: [
    'TrendLens feasibility=3, value=5. TrendPulse feasibility=4, value=5. AutoBrief feasibility=4, value=3.',
    'done',
  ],
  Select: [
    'I want to proceed with TrendPulse Dashboard with integrated TrendLens.',
    'done',
  ],
  Plan: [
    'Azure Functions backend, Azure Cognitive Services for image analysis, React frontend. 4 week PoC.',
    'done',
  ],
  Develop: [
    'TypeScript + Node.js backend, React dashboard. Must run locally for PoC.',
    'done',
  ],
  Complete: [],
};

// LLM responses that include JSON blocks for extraction
const ZAVA_LLM_RESPONSES: Record<PhaseValue, string[]> = {
  Discover: [
    `Great! Let me help you explore Zava Industries' challenges.

\`\`\`json
{
  "businessDescription": "Zava Industries is a mid-premium fashion company based in Milan specializing in trend-driven clothing for ages 20-55",
  "challenges": ["Speed of trend analysis", "Manual data gathering", "Scattered data across tools", "Slow trend-to-retail cycle"],
  "constraints": ["Azure-based infrastructure"],
  "successMetrics": [{"name": "Trend detection lead time", "value": "<1 week"}, {"name": "Collection hit rate", "value": "50%+"}]
}
\`\`\`

I understand your situation. Let's map out your workflow.`,

    `Excellent choice! Here's the workflow map:

\`\`\`json
{
  "activities": [
    {"id": "s1", "name": "Social Media Scanning"},
    {"id": "s2", "name": "Celebrity Monitoring"},
    {"id": "s3", "name": "Runway Tracking"},
    {"id": "s4", "name": "Competitor Analysis"},
    {"id": "s5", "name": "Signal Consolidation"},
    {"id": "s6", "name": "Trend Scoring"},
    {"id": "s7", "name": "Design Brief Creation"},
    {"id": "s8", "name": "Designer Feedback Loop"}
  ],
  "edges": [
    {"fromStepId": "s1", "toStepId": "s5"},
    {"fromStepId": "s2", "toStepId": "s5"},
    {"fromStepId": "s3", "toStepId": "s5"},
    {"fromStepId": "s4", "toStepId": "s5"},
    {"fromStepId": "s5", "toStepId": "s6"},
    {"fromStepId": "s6", "toStepId": "s7"},
    {"fromStepId": "s7", "toStepId": "s8"}
  ]
}
\`\`\``,

    `Great! The Discover phase is complete. Let's move on.`,
  ],
  Ideate: [
    `Here are the AI-powered ideas based on Zava's workflow:

\`\`\`json
[
  {"id": "idea-1", "title": "TrendLens", "description": "AI visual analyzer for social media and celebrity photos extracting fashion attributes in near-real-time", "workflowStepIds": ["s1", "s2", "s3"]},
  {"id": "idea-2", "title": "TrendPulse Dashboard", "description": "Unified real-time dashboard aggregating all trend signals with scores and lifecycle indicators", "workflowStepIds": ["s5", "s6"]},
  {"id": "idea-3", "title": "AutoBrief Generator", "description": "AI that creates design briefs from detected trends including visual mood boards", "workflowStepIds": ["s7", "s8"]},
  {"id": "idea-4", "title": "Celebrity Impact Tracker", "description": "AI correlating celebrity outfit appearances with social media engagement spikes", "workflowStepIds": ["s2"]},
  {"id": "idea-5", "title": "Trend Predictor", "description": "Predictive model estimating trend lifecycle and commercial potential", "workflowStepIds": ["s6"]}
]
\`\`\`

These ideas address your core bottleneck of manual trend analysis.`,
    `Great selection! Let's proceed to Design.`,
  ],
  Design: [
    `Here's the evaluation using a feasibility-value matrix:

\`\`\`json
{
  "ideas": [
    {"ideaId": "idea-1", "feasibility": 3, "value": 5, "risks": ["Social media API limits", "Fashion-domain CV accuracy"], "dataNeeded": ["Social media images", "Runway photos"]},
    {"ideaId": "idea-2", "feasibility": 4, "value": 5, "risks": ["Change management", "Data integration complexity"], "dataNeeded": ["All source feeds", "Historical sales data"]},
    {"ideaId": "idea-3", "feasibility": 4, "value": 3, "risks": ["Design quality expectations"], "dataNeeded": ["Trend data", "Existing briefs"]},
    {"ideaId": "idea-4", "feasibility": 3, "value": 4, "risks": ["Celebrity data availability"], "dataNeeded": ["Celebrity feeds", "Social engagement data"]},
    {"ideaId": "idea-5", "feasibility": 2, "value": 5, "risks": ["Historical data requirements"], "dataNeeded": ["Multi-year trend data"]}
  ],
  "method": "feasibility-value-matrix"
}
\`\`\`

\`\`\`mermaid
graph TD
  A[Social Media APIs] --> B[TrendLens Vision AI]
  B --> C[Signal Store]
  D[Celebrity Feeds] --> B
  E[Runway Data] --> B
  C --> F[TrendPulse Dashboard]
  F --> G[Trend Scoring Engine]
  G --> H[Design Brief Generator]
\`\`\``,
    `The Design phase is complete. Let's select the best idea.`,
  ],
  Select: [
    `Based on the evaluation, I recommend **TrendPulse Dashboard with integrated TrendLens**:

\`\`\`json
{
  "ideaId": "idea-2",
  "selectionRationale": "TrendPulse Dashboard has the best combined feasibility (4) and value (5) score. Integrating TrendLens visual AI gives it unique competitive advantage. It addresses the core bottleneck of manual data gathering and slow consolidation.",
  "confirmedByUser": true,
  "confirmedAt": "2026-03-04T07:00:00Z"
}
\`\`\``,
    `Selection confirmed. Moving to Planning.`,
  ],
  Plan: [
    `Here's the implementation plan:

\`\`\`json
{
  "milestones": [
    {"id": "m1", "title": "Foundation & Data Pipeline", "items": ["Set up Azure Functions project", "Create Instagram API connector", "Set up Cosmos DB schema"]},
    {"id": "m2", "title": "Visual AI Integration", "items": ["Integrate Azure Cognitive Services", "Build fashion attribute extractor", "Create trend signal storage"]},
    {"id": "m3", "title": "Dashboard & Scoring", "items": ["Build React dashboard", "Implement trend frequency charts", "Add scoring algorithm"]},
    {"id": "m4", "title": "Integration & Testing", "items": ["Connect all components", "Run with 100+ test images", "Measure accuracy against 70% target"]}
  ],
  "architectureNotes": "Azure Functions + Azure Cognitive Services + Cosmos DB + React. TypeScript throughout.",
  "dependencies": ["Instagram Graph API access", "Azure Cognitive Services subscription", "Cosmos DB instance"]
}
\`\`\``,
    `The Plan phase is complete. Ready for PoC development.`,
  ],
  Develop: [
    `PoC requirements captured:

\`\`\`json
{
  "repoSource": "local",
  "techStack": {
    "language": "TypeScript",
    "runtime": "Node.js 22",
    "testRunner": "vitest",
    "framework": "React + Azure Functions",
    "buildCommand": "npm run build"
  },
  "iterations": []
}
\`\`\``,
    `PoC specification complete. Run \`sofia dev\` to generate the code.`,
  ],
  Complete: [],
};

// ── Test infrastructure ──────────────────────────────────────────────────────

function createScriptedClient(phase: PhaseValue): CopilotClient {
  let responseIndex = 0;
  const responses = ZAVA_LLM_RESPONSES[phase];

  return {
    createSession: vi.fn().mockImplementation(async (_opts?: SessionOptions) => {
      return {
        send: vi.fn().mockImplementation(async function* () {
          const text = responses[Math.min(responseIndex, responses.length - 1)];
          responseIndex++;
          yield { type: 'TextDelta' as const, text };
        }),
      } as unknown as ConversationSession;
    }),
  } as unknown as CopilotClient;
}

function createScriptedIO(phase: PhaseValue): LoopIO {
  const inputs = [...ZAVA_USER_INPUTS[phase]];
  let inputIndex = 0;

  return {
    write: vi.fn(),
    writeActivity: vi.fn(),
    writeToolSummary: vi.fn(),
    readInput: vi.fn().mockImplementation(async () => {
      if (inputIndex < inputs.length) {
        return inputs[inputIndex++];
      }
      return null;
    }),
    showDecisionGate: vi.fn().mockResolvedValue({ choice: 'continue' }),
    isJsonMode: false,
    isTTY: false,
  };
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe('Zava Industries E2E Simulation', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sofia-zava-e2e-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('completes a full 6-phase workshop and produces complete export', async () => {
    let session: WorkshopSession = {
      sessionId: 'zava-e2e-sim',
      schemaVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      phase: 'Discover',
      status: 'Active',
      participants: [],
      artifacts: { generatedFiles: [] },
      turns: [],
    };

    const phases = getPhaseOrder(); // Discover, Ideate, Design, Select, Plan, Develop

    for (const phase of phases) {
      session.phase = phase;

      // Create a client that returns scripted responses for this phase
      const client = createScriptedClient(phase);
      const io = createScriptedIO(phase);

      // Create and preload the handler
      const handler = createPhaseHandler(phase);
      await handler._preload();

      const initialMessage = handler.getInitialMessage?.(session);

      const loop = new ConversationLoop({
        client,
        io,
        session,
        phaseHandler: handler,
        initialMessage,
        onSessionUpdate: async (updated) => {
          session = updated;
        },
      });

      session = await loop.run();
      session.updatedAt = new Date().toISOString();
    }

    // ── Verify structured data extraction ──────────────────────────────

    // Discover phase
    expect(session.businessContext).toBeDefined();
    expect(session.businessContext!.businessDescription).toContain('Zava Industries');
    expect(session.businessContext!.challenges.length).toBeGreaterThan(0);
    expect(session.workflow).toBeDefined();
    expect(session.workflow!.activities.length).toBeGreaterThanOrEqual(6);
    expect(session.workflow!.edges.length).toBeGreaterThan(0);

    // Ideate phase
    expect(session.ideas).toBeDefined();
    expect(session.ideas!.length).toBeGreaterThanOrEqual(3);
    expect(session.ideas!.some((i) => i.title.includes('TrendLens'))).toBe(true);
    expect(session.ideas!.some((i) => i.title.includes('TrendPulse'))).toBe(true);

    // Design phase
    expect(session.evaluation).toBeDefined();
    expect(session.evaluation!.method).toBe('feasibility-value-matrix');
    expect(session.evaluation!.ideas.length).toBeGreaterThanOrEqual(3);

    // Select phase
    expect(session.selection).toBeDefined();
    expect(session.selection!.ideaId).toBe('idea-2');
    expect(session.selection!.confirmedByUser).toBe(true);

    // Plan phase
    expect(session.plan).toBeDefined();
    expect(session.plan!.milestones.length).toBeGreaterThanOrEqual(3);
    expect(session.plan!.architectureNotes).toContain('Azure');

    // Develop phase
    expect(session.poc).toBeDefined();
    expect(session.poc!.repoSource).toBe('local');
    expect(session.poc!.techStack).toBeDefined();
    expect(session.poc!.techStack!.language).toBe('TypeScript');

    // ── Verify conversation turns captured ──────────────────────────────

    expect(session.turns).toBeDefined();
    expect(session.turns!.length).toBeGreaterThan(0);

    for (const phase of phases) {
      const phaseTurns = session.turns!.filter((t) => t.phase === phase);
      expect(phaseTurns.length).toBeGreaterThan(0);
    }

    // ── Verify context summarization works ──────────────────────────────

    const ctx = buildSummarizedContext(session);
    expect(ctx.businessSummary).toContain('Zava');
    expect(ctx.ideaSummaries).toBeDefined();
    expect(ctx.evaluationSummary).toBeDefined();
    expect(ctx.selectionSummary).toContain('idea-2');
    expect(ctx.planMilestones).toBeDefined();

    const rendered = renderSummarizedContext(ctx);
    expect(rendered).toContain('Prior Phase Context');
    expect(rendered).toContain('Zava');

    // ── Export and verify all 6 phase files generated ───────────────────

    await exportSession(session, tmpDir);
    const files = await readdir(tmpDir);

    expect(files).toContain('discover.md');
    expect(files).toContain('ideate.md');
    expect(files).toContain('design.md');
    expect(files).toContain('select.md');
    expect(files).toContain('plan.md');
    expect(files).toContain('develop.md');
    expect(files).toContain('summary.json');

    // Verify summary.json
    const summaryRaw = await readFile(join(tmpDir, 'summary.json'), 'utf-8');
    const summary = JSON.parse(summaryRaw);
    expect(summary.files.filter((f: { path: string }) => f.path.endsWith('.md')).length).toBe(6);
    expect(summary.highlights).toBeDefined();
    expect(summary.highlights.length).toBeGreaterThan(0);
    expect(summary.highlights.some((h: string) => h.includes('Zava'))).toBe(true);

    // Verify export files have content
    for (const phase of phases) {
      const content = await readFile(join(tmpDir, `${phase.toLowerCase()}.md`), 'utf-8');
      expect(content.length).toBeGreaterThan(50);
      expect(content).toContain(`# ${phase} Phase`);
    }

    // Verify ideate.md has both structured ideas and conversation
    const ideateContent = await readFile(join(tmpDir, 'ideate.md'), 'utf-8');
    expect(ideateContent).toContain('## Ideas');
    expect(ideateContent).toContain('TrendLens');
    expect(ideateContent).toContain('## Conversation');

    // Verify design.md has evaluation data
    const designContent = await readFile(join(tmpDir, 'design.md'), 'utf-8');
    expect(designContent).toContain('## Evaluation');
    expect(designContent).toContain('feasibility-value-matrix');
  }, 30000); // 30 second timeout

  it('phase boundary instruction is injected into system prompts', async () => {
    const session: WorkshopSession = {
      sessionId: 'boundary-test',
      schemaVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      phase: 'Ideate',
      status: 'Active',
      participants: [],
      artifacts: { generatedFiles: [] },
      turns: [],
    };

    const capturedPrompts: string[] = [];
    const client: CopilotClient = {
      createSession: vi.fn().mockImplementation(async (opts?: SessionOptions) => {
        if (opts?.systemPrompt) capturedPrompts.push(opts.systemPrompt);
        return {
          send: vi.fn().mockImplementation(async function* () {
            yield { type: 'TextDelta' as const, text: 'Response' };
          }),
        } as unknown as ConversationSession;
      }),
    } as unknown as CopilotClient;

    const io: LoopIO = {
      write: vi.fn(),
      writeActivity: vi.fn(),
      writeToolSummary: vi.fn(),
      readInput: vi.fn().mockResolvedValue(null),
      showDecisionGate: vi.fn().mockResolvedValue({ choice: 'continue' }),
      isJsonMode: false,
      isTTY: false,
    };

    const handler = createPhaseHandler('Ideate');
    await handler._preload();

    const loop = new ConversationLoop({
      client,
      io,
      session,
      phaseHandler: handler,
      initialMessage: 'Start ideation.',
    });

    await loop.run();

    // First captured prompt should be for the conversation (contains boundary)
    expect(capturedPrompts[0]).toContain('You are in the Ideate phase');
    expect(capturedPrompts[0]).toContain('Do NOT introduce or begin the next phase');
  });

  it('summarization fallback activates when inline extraction returns empty', async () => {
    const session: WorkshopSession = {
      sessionId: 'summarize-fallback-test',
      schemaVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      phase: 'Ideate',
      status: 'Active',
      participants: [],
      artifacts: { generatedFiles: [] },
      turns: [],
    };

    let callCount = 0;
    const client: CopilotClient = {
      createSession: vi.fn().mockImplementation(async () => ({
        send: vi.fn().mockImplementation(async function* () {
          callCount++;
          if (callCount <= 2) {
            // Main conversation — no JSON blocks (extraction will fail)
            yield { type: 'TextDelta' as const, text: 'Here are some creative ideas for your fashion business.' };
          } else {
            // Summarization call — returns proper JSON
            yield {
              type: 'TextDelta' as const,
              text: '```json\n[{"id":"idea-1","title":"TrendLens","description":"Visual AI","workflowStepIds":["s1"]}]\n```',
            };
          }
        }),
      })),
    } as unknown as CopilotClient;

    const io: LoopIO = {
      write: vi.fn(),
      writeActivity: vi.fn(),
      writeToolSummary: vi.fn(),
      readInput: vi.fn()
        .mockResolvedValueOnce('brainstorm ideas')
        .mockResolvedValue(null),
      showDecisionGate: vi.fn().mockResolvedValue({ choice: 'continue' }),
      isJsonMode: false,
      isTTY: false,
    };

    const handler = createPhaseHandler('Ideate');
    await handler._preload();

    const loop = new ConversationLoop({
      client,
      io,
      session,
      phaseHandler: handler,
      initialMessage: 'Start ideation.',
    });

    const result = await loop.run();

    // Summarization should have been invoked (3+ createSession calls)
    expect(callCount).toBeGreaterThanOrEqual(3);

    // Ideas should be populated via summarization fallback
    expect(result.ideas).toBeDefined();
    expect(result.ideas!.length).toBeGreaterThanOrEqual(1);
    expect(result.ideas![0].title).toBe('TrendLens');
  });
});
